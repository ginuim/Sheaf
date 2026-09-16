import { createHttpFetch } from "./http-fetch";

export function createAiFetch(): typeof fetch {
  return createHttpFetch();
}
