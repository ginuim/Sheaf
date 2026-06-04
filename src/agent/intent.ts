const writeVerbPattern =
  /写|撰写|起草|创作|生成|完善|补充|更新|修改|插入|追加|润色|改写|翻译|续写|扩写|补写/;
const writeNounPattern = /(一篇|一段|一章|一份).{0,12}(文章|游记|笔记|报告|文案|稿子|内容)/;
const writeArticlePattern = /(文章|游记|笔记|报告|文案|稿子)/;

export function looksLikeDocumentWriteTask(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;

  if (writeVerbPattern.test(text)) return true;
  if (writeNounPattern.test(text)) return true;
  if (/帮我|请|麻烦/.test(text) && writeArticlePattern.test(text)) return true;

  return false;
}
