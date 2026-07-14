/**
 * 构建后将 dist/ 内非 .html 静态资源同步到 Cloudflare R2。
 * 约定见 reaidea-product-dev skill：reference/r2-static-deploy.md
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

const BUILD_DIR = process.env.BUILD_DIR?.trim() || 'dist';
const DIST_PATH = join(ROOT, BUILD_DIR);

const REQUIRED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

const CONTENT_TYPES = {
	'.css': 'text/css',
	'.html': 'text/html',
	'.ico': 'image/x-icon',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.mjs': 'application/javascript',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.xml': 'application/xml',
};

function normalizePrefix(raw) {
	const value = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
	return value ? `${value}/` : '';
}

function cacheControlFor(relativePath) {
	if (relativePath.startsWith('_astro/') || relativePath.includes('/assets/')) {
		const ext = extname(relativePath).toLowerCase();
		if (['.js', '.css', '.woff', '.woff2'].includes(ext) || relativePath.startsWith('_astro/')) {
			return 'public, max-age=31536000, immutable';
		}
	}
	return 'public, max-age=86400';
}

function contentTypeFor(filePath) {
	return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function collectFiles(dir, baseDir = dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath, baseDir)));
			continue;
		}
		if (entry.isFile() && extname(entry.name).toLowerCase() !== '.html') {
			files.push(relative(baseDir, fullPath));
		}
	}

	return files;
}

function missingEnv() {
	return REQUIRED.filter((key) => !process.env[key]?.trim());
}

async function main() {
	const missing = missingEnv();
	if (missing.length > 0) {
		console.log(`[r2] 未配置 ${missing.join(', ')}，跳过 R2 上传。`);
		return;
	}

	try {
		await stat(DIST_PATH);
	} catch {
		console.error(`[r2] 构建目录不存在：${DIST_PATH}`);
		process.exit(1);
	}

	const accountId = process.env.R2_ACCOUNT_ID.trim();
	const bucket = process.env.R2_BUCKET.trim();
	const prefix = normalizePrefix(process.env.R2_PREFIX);

	const client = new S3Client({
		region: 'auto',
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
			secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
		},
	});

	const files = await collectFiles(DIST_PATH);
	if (files.length === 0) {
		console.log('[r2] dist/ 中没有可上传的静态资源。');
		return;
	}

	console.log(`[r2] 开始上传 ${files.length} 个文件 → bucket=${bucket} prefix=${prefix || '(根)'}\n`);

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const index = i + 1;
		const objectKey = `${prefix}${file.replace(/\\/g, '/')}`;
		const localPath = join(DIST_PATH, file);
		const { size } = await stat(localPath);

		process.stdout.write(
			`[r2] [${index}/${files.length}] ${objectKey} (${formatBytes(size)}) ... `,
		);

		const body = await readFile(localPath);

		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				Body: body,
				ContentType: contentTypeFor(localPath),
				CacheControl: cacheControlFor(file.replace(/\\/g, '/')),
			}),
		);

		console.log('完成');
	}

	const publicBase = process.env.R2_PUBLIC_BASE?.trim().replace(/\/+$/, '');
	console.log(`\n[r2] 全部完成，共 ${files.length} 个文件。`);
	if (publicBase) {
		console.log(`[r2] 公开访问根地址：${publicBase}`);
	}
}

main().catch((error) => {
	console.error('[r2] 上传失败：', error);
	process.exit(1);
});
