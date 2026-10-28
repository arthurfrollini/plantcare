import { shrinkPhoto, type Manipulate } from './shrinkPhoto';

/** A fake manipulator: every call renders an image of the given size and records resize/save. */
function fakeManipulate(width: number, height: number) {
  const resize = jest.fn();
  const saveAsync = jest.fn(() => Promise.resolve({ uri: 'file:///small.jpg' }));
  const manipulate: Manipulate = () => {
    const context = {
      resize: (size: { width?: number; height?: number }) => {
        resize(size);
        return context;
      },
      renderAsync: () => Promise.resolve({ width, height, saveAsync }),
    };
    return context;
  };
  return { manipulate, resize, saveAsync };
}

describe('shrinkPhoto', () => {
  it.each([
    ['landscape', 4000, 3000, { width: 1024 }],
    ['portrait', 3000, 4000, { height: 1024 }],
  ])('scales a %s photo so its long side is 1024 px', async (_, width, height, size) => {
    const fake = fakeManipulate(width, height);

    const photo = await shrinkPhoto({ uri: 'file:///big.jpg', mimeType: 'image/jpeg' }, fake.manipulate);

    expect(fake.resize).toHaveBeenCalledWith(size);
    expect(fake.saveAsync).toHaveBeenLastCalledWith({ compress: 0.7, format: 'jpeg' });
    expect(photo).toEqual({ uri: 'file:///small.jpg', mimeType: 'image/jpeg' });
  });

  it('keeps the size of a photo already small enough, and still saves it as JPEG', async () => {
    const fake = fakeManipulate(800, 600);

    const photo = await shrinkPhoto({ uri: 'file:///small.png', mimeType: 'image/png' }, fake.manipulate);

    expect(fake.resize).not.toHaveBeenCalled();
    expect(fake.saveAsync).toHaveBeenLastCalledWith({ compress: 0.7, format: 'jpeg' });
    expect(photo.mimeType).toBe('image/jpeg');
  });
});
