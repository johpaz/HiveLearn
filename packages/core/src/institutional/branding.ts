interface ImagePipeline {
  resize(width: number, height: number, options: { fit: string; withoutEnlargement: boolean }): ImagePipeline
  png(): ImagePipeline; bytes(): Promise<Uint8Array>
}
export async function normalizeLogo(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('El logo debe pesar entre 1 byte y 1 MB')
  const Image = (Bun as unknown as { Image: new (input: Uint8Array, options: { maxPixels: number }) => ImagePipeline }).Image
  if (!Image) throw new Error('Este runtime no expone Bun.Image; utiliza Bun 1.4.2')
  return new Image(bytes, { maxPixels: 4096 * 4096 }).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().bytes()
}
