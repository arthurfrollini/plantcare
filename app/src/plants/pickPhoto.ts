import * as ImagePicker from 'expo-image-picker';

/** A picked image, ready to upload. */
export type PlantPhoto = { uri: string; mimeType: string };
/** Why the picker gave no photo. */
export type PickMessage = 'denied' | 'unsupported' | 'failed';
/** A note under the photo: the picker's, or a failed upload or removal. */
export type PhotoMessage = PickMessage | 'uploadFailed' | 'removeFailed';
export type PhotoSource = 'camera' | 'gallery';

export type PickPhotoResult =
  | { photo: PlantPhoto }
  | { cancelled: true }
  | { message: PickMessage };

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function imageType(asset: { uri: string; mimeType?: string | undefined }): string | null {
  if (asset.mimeType) return IMAGE_TYPES.includes(asset.mimeType) ? asset.mimeType : null;
  const extension = asset.uri.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? null;
}

/** Asks for permission, opens the camera or the gallery, and checks the picked image type. */
export async function pickPhoto(source: PhotoSource): Promise<PickPhotoResult> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { message: 'denied' };

    const options = { mediaTypes: ['images' as const], quality: 0.8 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            // Makes iOS convert HEIC photos to JPEG, which the API accepts.
            preferredAssetRepresentationMode:
              ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { cancelled: true };

    const mimeType = imageType(asset);
    if (!mimeType) return { message: 'unsupported' };
    return { photo: { uri: asset.uri, mimeType } };
  } catch {
    return { message: 'failed' };
  }
}
