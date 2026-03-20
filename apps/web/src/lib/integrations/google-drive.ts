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

async function driveRequest<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: object | FormData,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = path.startsWith("http") ? path : `${DRIVE_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
  const opts: RequestInit = { method, headers };
  if (body && !(body instanceof FormData)) {
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
  opts: { query?: string; folderId?: string; pageSize?: number; pageToken?: string } = {}
): Promise<DriveFileList> {
  const params = new URLSearchParams();
  const qParts: string[] = ["trashed = false"];
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
  opts: { name: string; mimeType: string; content: Buffer | string; folderId?: string }
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: opts.name };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const boundary = "----DriveUploadBoundary";
  const metaPart = JSON.stringify(metadata);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
    `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n${typeof opts.content === "string" ? opts.content : opts.content.toString("base64")}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
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
