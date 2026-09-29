import { vi } from 'vitest';
import { filenameFromDisposition, saveFile } from './download';

describe('filenameFromDisposition', () => {
  it.each([
    ['attachment; filename="HDFC.pdf"', 'HDFC.pdf'],
    ['attachment; filename="Statement \\"Sep\\".pdf"', 'Statement "Sep".pdf'],
    [`attachment; filename="a.pdf"; filename*=UTF-8''%E0%A4%95.pdf`, 'क.pdf'],
    [`attachment; filename="a.pdf"; filename*=UTF-8''%E0%A4.pdf`, 'a.pdf'],
    ['attachment', 'download'],
    [undefined, 'download'],
  ])('should read %p', (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });
});

describe('saveFile', () => {
  it('should click a temporary download link and release the object URL', () => {
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    vi.useFakeTimers();
    saveFile(new Blob(['x']), 'HDFC.pdf');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    vi.useRealTimers();

    const link = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe('HDFC.pdf');
    expect(link.href).toBe('blob:1');
    expect(link.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
    click.mockRestore();
  });
});
