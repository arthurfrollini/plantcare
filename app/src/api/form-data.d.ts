// React Native's FormData accepts a file reference as a part; the DOM typings only know Blob.
interface FormData {
  append(name: string, value: { uri: string; name: string; type: string }): void;
}
