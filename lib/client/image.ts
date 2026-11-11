// Shrinks a picture in the browser so it fits Vercel's 4.5 MB request limit
// (screenshots of schedules are often several MB). Nothing is uploaded here.

export async function shrinkImage(file: Blob, maxSide = 1600): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that picture.");
  ctx.fillStyle = "#fff"; // transparent PNG screenshots would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.88);
  return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}
