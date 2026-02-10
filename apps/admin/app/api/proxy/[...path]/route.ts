import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

/**
 * Proxy API requests to the Express backend
 * This allows cookies to work correctly since both frontend and backend
 * appear on the same origin (localhost:3000)
 */
async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<NextResponse> {
  const { path } = await params;
  const pathname = path.join("/");
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}/api/${pathname}${url.search}`;

  // Get cookies from the request to forward to backend
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const cookieHeader = allCookies
    .map(c => `${c.name}=${c.value}`)
    .join("; ");

  console.log(`[Proxy] ${request.method} ${pathname} - Cookies:`, allCookies.map(c => c.name).join(", ") || "none");

  // Forward the request to the backend
  const headers = new Headers();
  
  // Check if this is a multipart request (file upload)
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  
  // Copy relevant headers
  request.headers.forEach((value, key) => {
    // Skip host header and other headers that shouldn't be forwarded
    // For multipart, we need to keep content-type (with boundary)
    if (!["host", "connection", "content-length", "cookie"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Set cookie header explicitly from cookie store
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  try {
    // For file uploads, pass the raw body as ArrayBuffer
    // For other requests, pass as text
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

    // Create response with backend's response
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Don't forward certain headers
      if (!["transfer-encoding", "content-encoding"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Check if this is a binary response (images, PDFs, ZIPs, etc.)
    const responseContentType = response.headers.get("content-type") || "";
    const isBinaryResponse = 
      responseContentType.startsWith("image/") ||
      responseContentType.startsWith("application/pdf") ||
      responseContentType.startsWith("application/octet-stream") ||
      responseContentType.startsWith("application/zip") ||
      responseContentType.startsWith("application/x-zip");

    if (isBinaryResponse) {
      // For binary files, return as ArrayBuffer to preserve data integrity
      const responseBody = await response.arrayBuffer();
      return new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // For text/JSON responses, return as text
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
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
