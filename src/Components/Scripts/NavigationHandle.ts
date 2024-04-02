/**
 * Navigate the directories of a DirectoryHandle, getting the requested file
 * @param mainHandle The handle of the main directory
 * @param path the path where the file is located
 * @param create if new folders/files should be created
 * @returns an object, containing the file name, the handle of the file and the handle of the directory
 */
export default async function navigateHandle(mainHandle: FileSystemDirectoryHandle, path: string, create?: boolean) {
    if (path.startsWith("/")) path = path.substring(1);
    let split = path.split("/");
    const fileName = split.pop() as string;
    for (let item of split) mainHandle = await mainHandle.getDirectoryHandle(item, { create: create });
    return {
        name: fileName,
        handle: await mainHandle.getFileHandle(fileName, { create: create }),
        directory: mainHandle
    }
}
