import { useEffect, useRef, useState } from "react";
import ConvertBytes from "./Scripts/ConvertBytes";
import navigateHandle from "./Scripts/NavigationHandle";
import FileRedownload from "./Scripts/FileRedownload";
import Tip from "./Tip";

interface Props {
    source: FileSystemDirectoryHandle,
    destination: FileSystemDirectoryHandle,
    options: BackupOptions
}
interface State {
    progress: number,
    showString: {
        name: string,
        edit: number,
        size: number,
        isDuplicate: boolean,
        entryNumber: number,
        duplicateInfo: DuplicateInfo
    }[],
    copiedFiles: string[],
    measure: string
}
interface Storage {
    source: string[]
    destination: string[]
}
interface DuplicateInfo {
    hash: [string, string],
    lastEdit: [number, number],
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
        measure: localStorage.getItem("EasyBackup-DefaultBytes") ?? "mb"
    });
    const stateStorage = useRef<Storage>({ source: [], destination: [] });
    const updateDomLabel = useRef(new Map<string, HTMLDivElement | null>());
    const updateDomProgress = useRef(new Map<string, HTMLProgressElement | null>());
    const progressNumberDom = useRef(0);
    const downloadUsingLink = useRef(localStorage.getItem("EasyBackup-DownloadLink") === "a");
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
                console.log(handle, sourcePath);
                for await (let entry of handle.values()) entry.kind === "file" ? keepSuggestedFiles(entry.name) && stateStorage.current[isInput ? "source" : "destination"].push(`${sourcePath}/${entry.name}`) : await getDirectory({ handle: await handle.getDirectoryHandle(entry.name), sourcePath: `${sourcePath}/${entry.name}`, isInput: isInput })
            }
            await getDirectory({ handle: source, sourcePath: "", isInput: true });
            await getDirectory({ handle: destination, sourcePath: "", isInput: false });
            if (mainProgress.current) mainProgress.current.max = stateStorage.current.source.length;
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
            const path = stateStorage.current.source[progress].substring(1); // Delete the "/" from the string. This is actually unnecessary, since it would be deleted later by the "navigateHandle" function
            const handle = (await navigateHandle(source, path)).handle;
            const file = await handle.getFile();
            let isDuplicate = stateStorage.current.destination.indexOf(stateStorage.current.source[progress]) !== -1;
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
                        const outputDuplicate = await (await navigateHandle(destination, stateStorage.current.source[progress].substring(1))).handle.getFile();
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
                interval = setInterval(async () => {
                    const handleObj = await navigateHandle(destination, stateStorage.current.source[progress].substring(1)); // Get directory handle
                    const item = await handleObj.directory.getFileHandle(`${handleObj.name}.crswap`); // Get file handle of the temp file made by Chromium-based browsers
                    const newFile = await item.getFile();
                    const progressDom = updateDomProgress.current.get(path);
                    if (progressDom) progressDom.value = newFile.size * 100 / file.size; // Calculate the progress with a proportion
                    const labelDom = updateDomLabel.current.get(path);
                    if (labelDom) labelDom.textContent = `${ConvertBytes({ number: newFile.size, type: "MB" })} MB / ${ConvertBytes({ number: file.size, type: "MB" })} MB`;
                }, options.refreshCopiedBytes);
                // Update the title (both window and header)
                document.title = `[${progressNumberDom.current}/${mainProgress.current?.max}] - EasyBackup`;
                if (operationSpan.current) operationSpan.current.textContent = `Copying ${stateStorage.current.source[progress].substring(1)}`;
                // Obtain the WritableStream and copy the file
                const writableStream = await (await navigateHandle(destination, stateStorage.current.source[progress].substring(1), true)).handle.createWritable();
                await writableStream.write(file);
                await writableStream.close();
                // Update the progress value and the label content of the specific item
                const progressDom = updateDomProgress.current.get(path);
                if (progressDom) progressDom.value = 100;
                const labelDom = updateDomLabel.current.get(path);
                if (labelDom) labelDom.textContent = `Completed!`;
                updateMainProgress(); // Update the progress value of the main activity
                updateState(prevState => { return { ...prevState, copiedFiles: [...prevState.copiedFiles, stateStorage.current.source[progress].substring(1)] } }); // Update the state, copying the next item
                clearInterval(interval);
            }
            if (!isDuplicate || isDuplicate && isForced) await copyCore();
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
        <h2>Operation: <span ref={operationSpan}>Starting...</span></h2>
        <progress ref={mainProgress}></progress>
        <br></br><br></br>
        <div className="container" style={{ overflow: "auto" }}>
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
                        <th>Action:</th>
                    </tr>
                    {state.showString.map(({ name, edit, size, isDuplicate, entryNumber, duplicateInfo }) => <tr key={`EasyBackup-FileName-${name}-${edit}-${size}-${isDuplicate}-${state.measure}`} style={{ backgroundColor: state.copiedFiles.indexOf(name) !== -1 ? "var(--success)" : isDuplicate && duplicateInfo.hash[0] === duplicateInfo.hash[1] ? "var(--accent)" : isDuplicate ? "var(--attention)" : undefined }}>
                        <td><label className="link" onClick={() => FileRedownload({ path: name, handle: source, useNormalLink: downloadUsingLink.current })}>{name}</label></td>
                        <td>{isDuplicate ? <>
                            <div role="label" className="topCompare link" onClick={() => FileRedownload({ path: name, handle: source, useNormalLink: downloadUsingLink.current })}>{new Date(duplicateInfo.lastEdit[0]).toLocaleString()}</div>
                            <div role="label" className="bottomCompare link" onClick={() => FileRedownload({ path: name, handle: destination, useNormalLink: downloadUsingLink.current })}>{new Date(duplicateInfo.lastEdit[1]).toLocaleString()}</div>
                        </> : new Date(edit).toLocaleString()}</td>
                        <td>{isDuplicate ? <>
                            <div role="label" className="topCompare">{ConvertBytes({ number: duplicateInfo.size[0], type: state.measure, truncate: options.decimalValues })}</div>
                            <div role="label" className="bottomCompare">{ConvertBytes({ number: duplicateInfo.size[1], type: state.measure, truncate: options.decimalValues })}</div>
                        </> : ConvertBytes({ number: size, type: state.measure, truncate: options.decimalValues })}</td>
                        {options.duplicates.startsWith("askcheck") && <td>
                            <div role="label">{duplicateInfo.hash[0]}</div>
                            <div role="label" className="bottomCompare">{duplicateInfo.hash[1]}</div>
                        </td>}
                        <td>{isDuplicate ? <div>
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
                        </>}</td>
                    </tr>)}
                </tbody>
            </table>
        </div></>

}