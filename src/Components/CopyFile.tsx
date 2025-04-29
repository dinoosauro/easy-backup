import { useEffect, useRef, useState } from "react";
import ConvertBytes from "./Scripts/ConvertBytes";
import navigateHandle from "./Scripts/NavigationHandle";
import FileRedownload from "./Scripts/FileRedownload";
import Tip from "./Tip";
import type { ZipWriterStream } from "@zip.js/zip.js";
import { createRoot } from "react-dom/client";

interface Props {
    source: FileSystemDirectoryHandle | FileList,
    destination: FileSystemDirectoryHandle | FileList,
    options: BackupOptions
}
interface State {
    /**
     * The position in the array of the file that is being copied
     */
    progress: number,
    /**
     * All the files that are shown in the table
     */
    showString: {
        /**
         * File name/path
         */
        name: string,
        /**
         * Last edit number (in ms)
         */
        edit: number,
        /**
         * File size
         */
        size: number,
        /**
         * If duplicate options (replace or skip) should be shown
         */
        isDuplicate: boolean,
        /**
         * The position of the path in the array
         */
        entryNumber: number,
        /**
         * Information about the duplicate file.
         */
        duplicateInfo: DuplicateInfo
    }[],
    /**
     * The array of the files that have been copied
     */
    copiedFiles: string[],
    /**
     * The unit used for file size
     */
    measure: string,
    /**
     * If the zip file has been closed. In this case, the table should hide the Duplicates button
     */
    zipFileFinished?: boolean
}
interface Storage {
    source: (string | File)[],
    sourcePath: string[]
    destination: (string | File)[],
    destinationPath: string[]
}
/**
 * Get information about the source and the destination file in case they're duplicates
 */
interface DuplicateInfo {
    /**
     * SHA-256 of the two files
     */
    hash: [string, string],
    /**
     * The last edit of the two files (in ms)
     */
    lastEdit: [number, number],
    /**
     * The size of the two files
     */
    size: [number, number]
}


/**
 * The main part of the application, where the files are copied.
 * @param source the source DirectoryHandle
 * @param destination the destination DirectoryHandle
 * @param options the BackupOptions to use for this operation
 * @returns the ReactNode of the file copy operation
 */
export default function CopyFile({ source, destination, options }: Props) {
    let [state, updateState] = useState<State>({
        progress: -1,
        showString: [],
        copiedFiles: [],
        measure: localStorage.getItem("EasyBackup-DefaultBytes") ?? "mb",
    });
    const stateStorage = useRef<Storage>({ source: [], destination: [], sourcePath: [], destinationPath: [] });
    const updateDomLabel = useRef(new Map<string, HTMLDivElement | null>());
    const updateDomProgress = useRef(new Map<string, HTMLProgressElement | null>());
    const progressNumberDom = useRef(0);
    const destinationFolder = useRef<string>("");
    const downloadUsingLink = useRef(typeof window.showDirectoryPicker === "undefined" || localStorage.getItem("EasyBackup-DownloadLink") === "a");
    function addToSource(file: string | File, isDestination = false) {
        let output = file instanceof File ? (file.webkitRelativePath || file.name).substring(Math.max(file.webkitRelativePath.indexOf("/"), 0)) : file;
        stateStorage.current[isDestination ? "destination" : "source"].push(file instanceof File ? file : output);
        stateStorage.current[`${isDestination ? "destination" : "source"}Path`].push(output);
    }
    /**
     * The ZipWriterStream that is used when saving the file as a Zip file
     */
    let zipFile = useRef<ZipWriterStream | undefined>(undefined);
    /**
     * The progress element of all the activities
     */
    let mainProgress = useRef<HTMLProgressElement>(null);
    /**
     * The heading that tells the user which file is being copied
     */
    let operationSpan = useRef<HTMLSpanElement>(null);
    /**
     * Update the progress of progress element of all the activities
     */
    function updateMainProgress() {
        progressNumberDom.current++;
        if (mainProgress.current) mainProgress.current.value = progressNumberDom.current;
        if (progressNumberDom.current === mainProgress.current?.max && operationSpan.current) { // Update also the progress text and the title to completed
            document.title = `[Completed] - EasyBackup`;
            operationSpan.current.textContent = "Completed!";
        }
    }
    useEffect((() => {
        // This effect will be run only the first time, and its goal is to obtain the  structure of the provided folders.
        (async () => {
            /**
             * Obtain recursively the structure of each subfolder
             * @param handle the FileSystemDirectoryHandle to use
             * @param sourcePath the source path of the folder, used for remembering nested folders
             * @param isInput if the item is in the "source" or "destination" folder
             */
            async function getDirectory({ handle, sourcePath, isInput }: { handle: FileSystemDirectoryHandle, sourcePath: string, isInput: boolean }) {
                for await (let entry of handle.values()) entry.kind === "file" ? keepSuggestedFiles(entry.name) && addToSource(`${sourcePath}/${entry.name}`, !isInput) : await getDirectory({ handle: await handle.getDirectoryHandle(entry.name), sourcePath: `${sourcePath}/${entry.name}`, isInput: isInput })
            }
            function addFiles(source: FileList, destination = false) {
                for (const file of source) keepSuggestedFiles(file.name) && addToSource(file, destination);
            }
            source instanceof FileList ? addFiles(source) : await getDirectory({ handle: source, sourcePath: "", isInput: true });
            destination instanceof FileList ? addFiles(destination, true) : await getDirectory({ handle: destination, sourcePath: "", isInput: false });
            if (mainProgress.current) mainProgress.current.max = stateStorage.current.source.length;
            if (destination instanceof FileList) {
                if (destination[0].webkitRelativePath) destinationFolder.current = destination[0].webkitRelativePath.substring(0, destination[0].webkitRelativePath.indexOf("/"));
                const zipjs = await import("@zip.js/zip.js");
                zipFile.current = new zipjs.ZipWriterStream({ zip64: options.useZip64 });
                /**
                 * The value that indicates if the File System API has been successfully used.
                 */
                let success = false;
                if (typeof window.showSaveFilePicker !== "undefined") { // Use the File System API
                    await new Promise<void>(res => { // Create a div where user action is requested so that the showSaveFilePicker request won't fail
                        const root = document.createElement("div");
                        const react = createRoot(root);
                        react.render(<div className="dialog">
                            <div>
                                <h2>Create the zip file</h2>
                                <p>You can create the zip file by clicking the button below. You'll be prompted to choose the file name and the path. We have to make you click another button since otherwise the "Save As" window cannot be opened due to browser restrictions.</p><br></br>
                                <button onClick={async () => {
                                    try {
                                        const file = await window.showSaveFilePicker({
                                            id: "EasyBackup-ZipFileSave", suggestedName: `${destinationFolder.current}-${Date.now()}.zip`, types: [
                                                {
                                                    description: "Zip File",
                                                    accept: {
                                                        "application/zip": [".zip"]
                                                    }
                                                }
                                            ]
                                        });
                                        (zipFile.current as ZipWriterStream).readable.pipeTo(await file.createWritable());
                                        success = true;
                                    } catch (ex) {
                                        console.warn(ex)
                                    }
                                    const dialog = root.querySelector(".dialog");
                                    if (dialog instanceof HTMLElement) dialog.style.opacity = "0";
                                    await new Promise(res2 => setTimeout(res2, 210));
                                    react.unmount();
                                    root.remove();
                                    res();
                                }}>Pick file</button>
                            </div>
                        </div>);
                        document.body.append(root);
                        setTimeout(() => { // Make the item visible
                            const item = root.querySelector(".dialog");
                            if (item instanceof HTMLElement) item.style.opacity = "1";
                        }, 50);
                    })
                }
                if (!success) { // Use the Service Worker method
                    await new Promise<void>((res) => {
                        /**
                         * The ID of this new file
                         */
                        const id = crypto?.randomUUID() ?? Math.random().toString();
                        /**
                         * The BroadcastChannel used to receive messages from the Service Worker
                         */
                        const broadcast = new BroadcastChannel("SWMessage");
                        /**
                         * The Map that contains the Promises to resolve each time a chunk has been processed from the Service Worker
                         */
                        const ResMap = new Map<string, () => void>();
                        broadcast.onmessage = (msg) => {
                            switch (msg.data.action) {
                                case "CreateStream": { // The zip file has been created.
                                    if (msg.data.id === id) {
                                        zipFile.current?.readable.pipeTo(new WritableStream({
                                            write: async (chunk) => {
                                                await new Promise<void>(res2 => { // Create a new Promise, that'll be resolved only when the Service Worker has added the chunk to the other stream.
                                                    /**
                                                     * The ID only for this specific chunk
                                                     */
                                                    const secondId = crypto?.randomUUID() ?? Math.random().toString();
                                                    ResMap.set(secondId, res2);
                                                    navigator.serviceWorker.controller?.postMessage({ action: "WriteFile", chunk, id, secondId }); // Send the chunk to the Service Worker
                                                })
                                            },
                                            close: () => { // Finalize the zip file
                                                navigator.serviceWorker.controller?.postMessage({ action: "CloseStream", id });
                                            }
                                        }));
                                        if (!(/^((?!chrome|android).)*safari/i.test(navigator.userAgent))) { // Quick method to detect if Safari is being used. If not, open a pop-up window to download it (since otherwise it would fail).
                                            const win = window.open(`${window.location.href}${window.location.href.endsWith("/") ? "" : "/"}downloader?id=${id}`, "_blank", "width=200,height=200");
                                            if (!win) alert("A pop-up window was blocked. Please open it so that the download can start.");
                                            (new Blob(["This file was automatically generated to close your browser's pop-up window. You can safely delete it."])).stream().pipeTo((zipFile.current as ZipWriterStream).writable("_.txt"));
                                        } else {
                                            /**
                                            * Add an iFrame to the page to download the file. 
                                            * This seems to work only on Safari, since it causes Chrome to crash and Firefox to block the resource. 
                                            * I think that's the second time something works on Safari and not on Chrome, really surprised since usually it's the other way around.
                                            */
                                            const iframe = document.createElement("iframe");
                                            iframe.src = `${window.location.href}${window.location.href.endsWith("/") ? "" : "/"}downloader?id=${id}`;
                                            iframe.style = "width: 1px; height: 1px; position: fixed; top: -1px; left: -1px;"
                                            document.body.append(iframe);
                                        }
                                        res();
                                    }
                                    break;
                                }
                                case "WriteFile": { // The chunk has been written. Resolve the promise
                                    if (msg.data.id === id) {
                                        const fn = ResMap.get(msg.data.secondId);
                                        fn && fn();
                                    }
                                    break;
                                }
                            }
                        }
                        navigator.serviceWorker.controller?.postMessage({ action: "CreateStream", id, fileName: `${destinationFolder.current}-${Date.now()}.zip` }); // Ask the service worker to create the new zip file
                    })
                }
            } else destinationFolder.current = destination.name;
            updateState(prevState => { return { ...prevState, progress: prevState.progress + 1 } }); // Start process
        })()
    }), []);
    /**
     * Keep only the files that ends with the specified string
     * @param file the file name
     * @returns true if the file should be kept, otherwise false
     */
    function keepSuggestedFiles(file: string) {
        for (const item of options.fileEnd.split("|")) {
            if (file.endsWith(item)) return true;
        }
        return false;
    }
    /**
     * Copy an item from the source to the destination folder
     * @param progress the position in the source array of the item to copy
     * @param isForced copy even if it's a duplicate
     * @returns A promise, resolved when the copy happened
     */
    async function copyItem(progress: number, isForced?: boolean) {
        /**
         * The interval that'll be used for checking the file size. Its ID is saved so that it can be cleared when the copy operation has ended
         */
        let interval;
        try {
            let file: File;
            const path = stateStorage.current.sourcePath[progress].substring(stateStorage.current.sourcePath[progress].startsWith("/") ? 1 : 0); // Delete the "/" from the string. This is actually unnecessary, since it would be deleted later by the "navigateHandle" function
            if (!(stateStorage.current.source[progress] instanceof File)) {
                const handle = (await navigateHandle((source as FileSystemDirectoryHandle), path)).handle;
                file = await handle.getFile();
            } else {
                file = stateStorage.current.source[progress];
            }
            let isDuplicate = stateStorage.current.destinationPath.indexOf(stateStorage.current.sourcePath[progress]) !== -1;
            let duplicateInfo: DuplicateInfo = { hash: ["", ""], lastEdit: [0, 0], size: [0, 0] };
            if (isDuplicate) {
                switch (options.duplicates) {
                    case "skip": // Skip file since it's duplicated
                        updateMainProgress();
                        !isForced && updateState(prevState => { return { ...prevState, progress: prevState.progress + 1 } });
                        return;
                    case "overwrite": // Ignore that it's a duplicate and replace it
                        isDuplicate = false;
                        break;
                    default: {
                        /**
                         * Gets a SHA256 hash of an ArrayBuffer
                         * @param buffer the ArrayBuffer of the content
                         * @returns a string containing the SHA256 hash of the file
                         */
                        async function getHash(buffer: ArrayBuffer) {
                            return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map((e) => e.toString(16).padStart(2, "0")).join("")
                        }
                        const outputDuplicate = destination instanceof FileList ? (stateStorage.current.destination as File[])[stateStorage.current.destinationPath.indexOf(stateStorage.current.sourcePath[progress])] : await (await navigateHandle(destination, stateStorage.current.sourcePath[progress].substring(1))).handle.getFile();
                        if (options.duplicates.startsWith("askcheck")) duplicateInfo.hash = [await getHash(await file.arrayBuffer()), await getHash(await outputDuplicate.arrayBuffer())]; // Calculate hash only if the user wants to
                        if (options.duplicates === "askcheckskip" && duplicateInfo.hash[0] === duplicateInfo.hash[1]) { // Skip since the files are the same
                            updateMainProgress();
                            !isForced && updateState(prevState => { return { ...prevState, progress: prevState.progress + 1 } });
                            return;
                        }
                        duplicateInfo.lastEdit = [file.lastModified, outputDuplicate.lastModified];
                        duplicateInfo.size = [file.size, outputDuplicate.size]
                    }
                }
            }
            /**
             * Updates the State's "showString" property, by removing the "isDuplicate" boolean if the copy is forced or by pushing the values to the array if it's new content
             * @param state the previous State to update
             * @returns An updated "showString" property of the state
             */
            function adaptState(state: State) {
                if (isForced) {
                    // @ts-ignore
                    state.showString.find(item => item.entryNumber === progress).isDuplicate = false;
                    return state.showString;
                }
                state.showString.push({ name: path, edit: file.lastModified, size: file.size, isDuplicate: !isForced && isDuplicate, entryNumber: state.progress, duplicateInfo: duplicateInfo });
                return state.showString;
            }
            updateState(prevState => { return { ...prevState, showString: adaptState(prevState) } });
            /**
             * The function that will handle the copy process of the file
             */
            async function copyCore() {
                document.title = `[${progressNumberDom.current}/${mainProgress.current?.max}] - EasyBackup`;
                if (!(destination instanceof FileList)) {
                    interval = setInterval(async () => {
                        const handleObj = await navigateHandle(destination, path); // Get directory handle
                        const item = await handleObj.directory.getFileHandle(`${handleObj.name}.crswap`); // Get file handle of the temp file made by Chromium-based browsers
                        const newFile = await item.getFile();
                        const progressDom = updateDomProgress.current.get(path);
                        if (progressDom) progressDom.value = newFile.size * 100 / file.size; // Calculate the progress with a proportion
                        const labelDom = updateDomLabel.current.get(path);
                        if (labelDom) labelDom.textContent = `${ConvertBytes({ number: newFile.size, type: "MB" })} MB / ${ConvertBytes({ number: file.size, type: "MB" })} MB`;
                    }, options.refreshCopiedBytes);
                    // Update the title (both window and header)
                    if (operationSpan.current) operationSpan.current.textContent = `Copying ${path}`;
                    // Obtain the WritableStream and copy the file
                    const writableStream = await (await navigateHandle(destination, path, true)).handle.createWritable();
                    options.useStream ? await file.stream().pipeTo(writableStream) : await writableStream.write(file);
                    !options.useStream && await writableStream.close();
                    updateMainProgress(); // Update the progress value of the main activity
                    updateState(prevState => { return { ...prevState, copiedFiles: [...prevState.copiedFiles, path] } }); // Update the state, copying the next item
                    clearInterval(interval);
                } else if (zipFile.current) {
                    if (operationSpan.current) operationSpan.current.textContent = `Adding ${path} to the zip file`;
                    await file.stream().pipeTo(zipFile.current.writable(path));
                    updateMainProgress();
                    updateState(prevState => { return { ...prevState, copiedFiles: [...prevState.copiedFiles, path] } }); // Update the state, copying the next item
                }
                // Update the progress value and the label content of the specific item
                const progressDom = updateDomProgress.current.get(path);
                if (progressDom) progressDom.value = 100;
                const labelDom = updateDomLabel.current.get(path);
                if (labelDom) labelDom.textContent = `Completed!`;
                await new Promise(res => setTimeout(res, options.sleep));
            }
            if (!isDuplicate || isDuplicate && isForced) await copyCore();
            if (operationSpan.current) operationSpan.current.textContent = "Waiting user input for duplicates...";
            if (!isForced) updateState(prevState => { return { ...prevState, progress: prevState.progress + 1 } })
        } catch (ex) {
            console.warn(ex);
            interval && clearInterval(interval);
            updateMainProgress()
            ex instanceof TypeError && updateState(prevState => { return { ...prevState, progress: prevState.progress + 1 } });
        }
    }
    useEffect(() => { // Copy the next file, with an effect called only when the "progress" value of the state is updated
        (async () => {
            if (state.progress === -1 || stateStorage.current.source.length <= state.progress) return;
            copyItem(state.progress)
        })()
    }, [state.progress])
    return <>
        {typeof window.showSaveFilePicker !== "undefined" && <>
            <Tip title="Check the files:">
                <label>You can download duplicate files by clicking on their "Last edit" date, or you can download the source file by clicking its name. All the links are in light bold.</label><br></br><br></br>
                <label>Download using:</label><select onChange={(e) => {
                    let target = e.target as HTMLSelectElement;
                    downloadUsingLink.current = target.value === "a";
                    localStorage.setItem("EasyBackup-DownloadLink", target.value);
                }} defaultValue={localStorage.getItem("EasyBackup-DownloadLink") ?? "b"} style={{ backgroundColor: "var(--second)" }}>
                    <option value={"a"}>Link</option>
                    <option value={"b"}>Save File Picker</option>
                </select>
            </Tip><br></br>
        </>}
        <h2>Operation: <span ref={operationSpan}>Starting...</span></h2>
        <progress ref={mainProgress}></progress>
        <br></br><br></br>
        {destination instanceof FileList && <>
            <button onClick={async () => {
                await zipFile.current?.close();
                alert("The zip file has been saved. If you didn't choose where to save it, you can find it in the Downloads folder.");
                if (operationSpan.current) operationSpan.current.textContent = "Zip file closed and saved!";
                document.title = `[Completed] - EasyBackup`;
                if (mainProgress.current) mainProgress.current.value = mainProgress.current.max;
                updateState(prevState => { return { ...prevState, zipFileFinished: true } });
            }}>Close ZIP file (the download will stop, but you won't be able to do other edits.)</button>
        </>}
        <div className="container" style={{ overflow: "auto", margin: "10px 0px" }}>
            <h3>File table:</h3>
            <table>
                <tbody id="addFiles">
                    <tr>
                        <th>File name:</th>
                        <th>Last edit:</th>
                        <th><span>Size:</span><select onChange={(e) => {
                            localStorage.setItem("EasyBackup-DefaultBytes", (e.target as HTMLSelectElement).value);
                            updateState(prevState => { return { ...prevState, measure: (e.target as HTMLSelectElement).value } })
                        }} defaultValue={localStorage.getItem("EasyBackup-DefaultBytes") ?? "mb"} style={{ backgroundColor: "var(--second)" }}>
                            <option value="b">Byte(s)</option>
                            <option value="kb">Kilobyte(s)</option>
                            <option value="mb">Megabyte(s)</option>
                            <option value="gb">Gigabyte(s)</option>
                            <option value="tb">Terabyte(s)</option>
                        </select></th>
                        {options.duplicates.startsWith("askcheck") && <th>Hash (only for duplicates)</th>}
                        {!state.zipFileFinished && <th>Action:</th>}
                    </tr>
                    {state.showString.map(({ name, edit, size, isDuplicate, entryNumber, duplicateInfo }) => <tr key={`EasyBackup-FileName-${name}-${edit}-${size}-${isDuplicate}-${state.measure}`} style={{ backgroundColor: state.copiedFiles.indexOf(name) !== -1 ? "var(--success)" : isDuplicate && duplicateInfo.hash[0] === duplicateInfo.hash[1] ? "var(--accent)" : isDuplicate ? "var(--attention)" : undefined }}>
                        <td><label className="link" onClick={() => FileRedownload({ path: name, handle: source instanceof FileList ? source[entryNumber] : source, useNormalLink: downloadUsingLink.current })}>{name}</label></td>
                        <td>{isDuplicate ? <>
                            <div role="label" className="topCompare link" onClick={() => FileRedownload({ path: name, handle: source instanceof FileList ? source[entryNumber] : source, useNormalLink: downloadUsingLink.current })}>{new Date(duplicateInfo.lastEdit[0]).toLocaleString()}</div>
                            <div role="label" className="bottomCompare link" onClick={() => FileRedownload({ path: name, handle: destination instanceof FileList ? destination[entryNumber] : destination, useNormalLink: downloadUsingLink.current })}>{new Date(duplicateInfo.lastEdit[1]).toLocaleString()}</div>
                        </> : new Date(edit).toLocaleString()}</td>
                        <td>{isDuplicate ? <>
                            <div role="label" className="topCompare">{ConvertBytes({ number: duplicateInfo.size[0], type: state.measure, truncate: options.decimalValues })}</div>
                            <div role="label" className="bottomCompare">{ConvertBytes({ number: duplicateInfo.size[1], type: state.measure, truncate: options.decimalValues })}</div>
                        </> : ConvertBytes({ number: size, type: state.measure, truncate: options.decimalValues })}</td>
                        {options.duplicates.startsWith("askcheck") && <td>
                            <div role="label">{duplicateInfo.hash[0]}</div>
                            <div role="label" className="bottomCompare">{duplicateInfo.hash[1]}</div>
                        </td>}
                        {!state.zipFileFinished && <td>{isDuplicate ? <div>
                            <button onClick={() => copyItem(entryNumber, true)}>Replace</button>
                            <button onClick={() => {
                                updateState(prevState => {
                                    // Delete from the UI 
                                    let arr = prevState.showString;
                                    arr.splice(arr.findIndex(item => item.name === name), 1);
                                    updateMainProgress(); // Update the progress. Note that we don't edit the maximum number, so we'll mark this as completed even if it was skipped.
                                    return {
                                        ...prevState, showString: arr
                                    }
                                })
                            }}>Skip</button>
                        </div> : <><progress max={100} className="bottomCompare" value={0} ref={el => (updateDomProgress.current.set(name, el))}></progress>
                            <div role="label" className="bottomCompare" ref={el => (updateDomLabel.current.set(name, el))}>NA</div>
                        </>}</td>}
                    </tr>)}
                </tbody>
            </table>
        </div></>

}