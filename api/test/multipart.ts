/** A multipart/form-data body for app.inject, with text fields and an optional photo. */
export function multipart(
  fields: Record<string, string>,
  photo?: { data: Buffer; filename?: string; type?: string },
): { payload: Buffer; contentType: string } {
  const boundary = '----plantcareboundary';
  const parts: Buffer[] = Object.entries(fields).map(([name, value]) =>
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  );
  if (photo) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${photo.filename ?? 'photo.jpg'}"\r\nContent-Type: ${photo.type ?? 'image/jpeg'}\r\n\r\n`,
      ),
      photo.data,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** The smallest bytes detectPhotoType accepts as a JPEG. */
export const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);
