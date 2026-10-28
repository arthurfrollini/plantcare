import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PlantPhoto } from './pickPhoto';

/** The longest side sent to the AI; the model reads plants fine at this size, and it cuts cost. */
const MAX_SIDE = 1024;
const QUALITY = 0.7;

type Rendered = {
  width: number;
  height: number;
  saveAsync(options: { compress: number; format: SaveFormat }): Promise<{ uri: string }>;
};
type Context = {
  resize(size: { width?: number; height?: number }): Context;
  renderAsync(): Promise<Rendered>;
};
/** The part of ImageManipulator this uses; tests pass a fake. */
export type Manipulate = (uri: string) => Context;

/** Shrinks a photo so its long side is at most 1024 px and saves it as a JPEG at quality 0.7. */
export async function shrinkPhoto(
  photo: PlantPhoto,
  manipulate: Manipulate = (uri) => ImageManipulator.manipulate(uri),
): Promise<PlantPhoto> {
  const original = await manipulate(photo.uri).renderAsync();
  const longSide = Math.max(original.width, original.height);
  const image =
    longSide <= MAX_SIDE
      ? original
      : await manipulate(photo.uri)
          .resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE })
          .renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, mimeType: 'image/jpeg' };
}
