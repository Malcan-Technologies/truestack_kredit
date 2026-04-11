export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Invalid response");
  }
}
