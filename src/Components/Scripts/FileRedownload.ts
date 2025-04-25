import navigateHandle from "./NavigationHandle"

interface Props {
    path: string,
    handle: FileSystemDirectoryHandle | File,
    useNormalLink?: boolean
}
/**
 * Download the provided file, using either the File System API or a link
 * @param path the path of the file to download
 * @param handle the handle to use for downloading the file
 * @param useNormalLink if true, a link will be created with an ArrayBuffer to download the file, instead of using the "saveFilePicker" function
 * @returns A promise, resolved when either the copy has succeded or the file download has started
 */
export default async function FileRedownload({ path, handle, useNormalLink }: Props) {
    const file = handle instanceof File ? handle : await (await navigateHandle(handle, path)).handle.getFile();
    if (useNormalLink) {
        let a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = path.substring(path.lastIndexOf("/") + 1);
        a.click();
        URL.revokeObjectURL(a.href);
        return;
    }
    const saveFile = await window.showSaveFilePicker({ suggestedName: file.name });
    const writable = await saveFile.createWritable();
    await writable.write(file);
    await writable.close();
}