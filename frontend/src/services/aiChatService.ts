const API_BASE =
  import.meta.env.VITE_AI_CHAT_SERVICE_URL || "http://localhost:3005";

type RequestOptions = RequestInit & {
  headers?: Record<string, string>;
};

async function authFetch<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);
  const token = localStorage.getItem("accessToken");

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(data?.error || "Unauthorized");
      }
      throw new Error(JSON.stringify(data));
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request to ai chat service timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getRemainingPromptCount(
  sessionId: string,
  userId: string,
) {
  return authFetch<{
    count: number;
    limit: number;
    remainingRequests: number;
  }>(
    `${API_BASE}/sessions/${sessionId}/promptCount?userId=${encodeURIComponent(userId)}`,
    {
      method: "GET",
    },
  ).then((data) => {
   
    return {
      count: data.count,
      limit: data.limit,
      remainingRequests: data.remainingRequests,
    };
  });
}
