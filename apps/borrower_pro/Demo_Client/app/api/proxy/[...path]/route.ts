import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4001";

/**
 * Proxy API requests to the backend_pro Express server.
 * Forwards cookies so session-based auth works.
 */
async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<NextResponse> {
  const { path } = await params;
  const pathname = path.join("/");
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}/api/${pathname}${url.search}`;

  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const cookieHeader = allCookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const headers = new Headers();
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  request.headers.forEach((value, key) => {
    if (
      !["host", "connection", "content-length", "cookie"].includes(
        key.toLowerCase()
      )
    ) {
      headers.set(key, value);
    }
  });

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  try {
    let body: ArrayBuffer | string | undefined = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (isMultipart) {
        body = await request.arrayBuffer();
      } else {
        body = await request.text();
      }
    }

    const response = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (
        !["transfer-encoding", "content-encoding"].includes(key.toLowerCase())
      ) {
        responseHeaders.set(key, value);
      }
    });

    const responseContentType = response.headers.get("content-type") || "";
    const isBinaryResponse =
      responseContentType.startsWith("image/") ||
      responseContentType.startsWith("application/pdf") ||
      responseContentType.startsWith("application/octet-stream") ||
      responseContentType.startsWith("application/zip") ||
      responseContentType.startsWith("application/x-zip");

    if (isBinaryResponse) {
      const responseBody = await response.arrayBuffer();
      return new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Proxy] error:", error);
    return NextResponse.json(
      { success: false, error: "Backend unavailable" },
      { status: 503 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}
