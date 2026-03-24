/**
 * Google Drive API client (no SDK, fetch only).
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
};

export type DriveFileList = {
  files: DriveFile[];
  nextPageToken?: string;
};

export type DrivePermission = {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role: "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader";
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
};

async function driveRequest<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: object | FormData | BodyInit,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = path.startsWith("http") ? path : `${DRIVE_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
  const opts: RequestInit = { method, headers };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (
    body instanceof Uint8Array ||
    body instanceof ArrayBuffer ||
    typeof body === "string" ||
    (typeof Blob !== "undefined" && body instanceof Blob)
  ) {
    opts.body = body as BodyInit;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API ${method} ${path}: ${res.status} ${err}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listDriveFiles(
  accessToken: string,
  opts: { query?: string; folderId?: string; pageSize?: number; pageToken?: string; extraQuery?: string } = {}
): Promise<DriveFileList> {
  const params = new URLSearchParams();
  const qParts: string[] = [];

  if (opts.extraQuery) {
    const eq = opts.extraQuery;
    if (eq === "trashed=true") {
      qParts.push("trashed = true");
    } else if (eq === "sharedWithMe=true") {
      qParts.push("sharedWithMe = true");
      qParts.push("trashed = false");
    } else if (eq === "starred=true") {
      qParts.push("starred = true");
      qParts.push("trashed = false");
    } else if (eq.startsWith("modifiedTime")) {
      qParts.push(eq);
      qParts.push("trashed = false");
    } else {
      qParts.push("trashed = false");
    }
  } else {
    qParts.push("trashed = false");
  }

  if (opts.folderId) qParts.push(`'${opts.folderId}' in parents`);
  if (opts.query) qParts.push(`name contains '${opts.query.replace(/'/g, "\\'")}'`);
  params.set("q", qParts.join(" and "));
  params.set("fields", "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents)");
  params.set("pageSize", String(opts.pageSize ?? 50));
  params.set("orderBy", "modifiedTime desc");
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  return driveRequest<DriveFileList>(accessToken, "GET", `/files?${params.toString()}`);
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];
  return driveRequest<DriveFile>(accessToken, "POST", "/files", metadata);
}

export async function uploadDriveFile(
  accessToken: string,
  opts: { name: string; mimeType: string; content: Buffer | Uint8Array | string; folderId?: string }
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: opts.name };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const boundary = `----DriveUploadBoundary${Date.now()}`;
  const metaPart = JSON.stringify(metadata);
  const fileBuffer =
    typeof opts.content === "string"
      ? Buffer.from(opts.content, "utf-8")
      : Buffer.from(opts.content);
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
    "utf-8"
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`, "utf-8");
  const body = Buffer.concat([prefix, fileBuffer, suffix]);

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<DriveFile>;
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  await driveRequest<void>(accessToken, "DELETE", `/files/${encodeURIComponent(fileId)}`);
}

export async function getDriveFile(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  return driveRequest<DriveFile>(
    accessToken,
    "GET",
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents`
  );
}

export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  opts: { name?: string; addParents?: string[]; removeParents?: string[] }
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents",
  });
  if (opts.addParents?.length) params.set("addParents", opts.addParents.join(","));
  if (opts.removeParents?.length) params.set("removeParents", opts.removeParents.join(","));
  const body: Record<string, string> = {};
  if (opts.name) body.name = opts.name;
  return driveRequest<DriveFile>(
    accessToken,
    "PATCH",
    `/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    Object.keys(body).length ? body : {}
  );
}

export async function createDrivePermission(
  accessToken: string,
  fileId: string,
  permission: {
    type: "user" | "group" | "domain" | "anyone";
    role: "reader" | "commenter" | "writer";
    emailAddress?: string;
    domain?: string;
    allowFileDiscovery?: boolean;
  }
): Promise<DrivePermission> {
  return driveRequest<DrivePermission>(
    accessToken,
    "POST",
    `/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`,
    permission
  );
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<{ data: Buffer; contentType: string | null }> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive download failed: ${res.status} ${err}`);
  }
  const arr = await res.arrayBuffer();
  return {
    data: Buffer.from(arr),
    contentType: res.headers.get("content-type"),
  };
}

/** Export nativního Google souboru (Docs/Sheets/Slides) do PDF apod. */
export async function exportDriveFile(
  accessToken: string,
  fileId: string,
  exportMimeType: string
): Promise<{ data: Buffer; contentType: string | null }> {
  const params = new URLSearchParams({ mimeType: exportMimeType });
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive export failed: ${res.status} ${err}`);
  }
  const arr = await res.arrayBuffer();
  return {
    data: Buffer.from(arr),
    contentType: res.headers.get("content-type") || exportMimeType,
  };
}
