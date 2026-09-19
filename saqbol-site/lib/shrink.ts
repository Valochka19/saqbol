/**
 * Уменьшает скриншот прямо в браузере перед отправкой: длинная сторона до 1400 px, JPEG.
 * Так запрос укладывается в лимит документа Firestore (1 МБ), а текст на картинке остаётся читаемым.
 * Возвращает base64 без префикса и готовый data-URL для предпросмотра.
 */
export async function shrinkImage(file: Blob, maxBase64 = 900_000): Promise<{ base64: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  let side = 1400;
  let quality = 0.78;

  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // прозрачный PNG на белом, иначе JPEG зальёт фон чёрным
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const preview = canvas.toDataURL("image/jpeg", quality);
    const base64 = preview.slice(preview.indexOf(",") + 1);
    if (base64.length <= maxBase64) return { base64, preview };
    side = Math.round(side * 0.8);
    quality = Math.max(0.5, quality - 0.08);
  }
  throw new Error("too_large");
}
