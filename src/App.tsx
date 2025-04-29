import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Header from "./Components/Basic/Header";
import Tip from "./Components/Tip";
import CopyFile from "./Components/CopyFile";
interface DirectoryPicker {
  id?: string,
  mode?: string
}
interface SaveFilePicker {
  id?: string,
  suggestedName?: string,
  types?: {
    description: string,
    accept: {}
  }[]
}

declare global {
  interface Window {
    showDirectoryPicker: ({ id, mode }: DirectoryPicker) => Promise<FileSystemDirectoryHandle>,
    showSaveFilePicker: ({ id, suggestedName, types }: SaveFilePicker) => Promise<FileSystemFileHandle>,
    ZIP: any
  }
  interface FileSystemDirectoryHandle {
    values: () => {
      kind: string,
      name: string
    }[]
  }
  interface BackupOptions {
    duplicates: "skip" | "overwrite" | "ask" | "askcheck" | "askcheckskip",
    fileEnd: string,
    decimalValues: number,
    refreshCopiedBytes: number,
    useNormalPicker: boolean,
    pickDirectory: boolean,
    useStream: boolean,
    sleep: number,
    useZip64: boolean
  }
}
interface State {
  process: number;
  sourceHandle: FileSystemDirectoryHandle | FileList | null;
  outputHandle: FileSystemDirectoryHandle | FileList | null;
}
export default function App() {
  /**
 * Options for the current backup
 * @param duplicates how duplicates should be handled ("skip" them, "overwrite" them, "ask" the user, "askcheck" for checking also their hash or "askcheckskip" for skipping the files that have the same hash)
 * @param fileEnd keep only the files that ends with that string
 * @param decimalValues the number of decimal values to keep for file sizes
 * @param refreshCopiedBytes every *this* ms, check the progress of the file copy
 */
  let backupOptions = useRef<BackupOptions>({
    duplicates: "ask",
    fileEnd: "",
    decimalValues: 2,
    refreshCopiedBytes: 2500,
    useNormalPicker: typeof window.showDirectoryPicker === "undefined",
    pickDirectory: true,
    useStream: false,
    sleep: 500,
    useZip64: false
  });
  // Restore options from LocalStorage
  const restoreOptions = JSON.parse(localStorage.getItem("EasyBackup-BackupOptions") ?? "{}") as BackupOptions;
  // @ts-ignore
  for (let item in restoreOptions) backupOptions.current[item] = restoreOptions[item];
  let [state, updateState] = useState<State>({ process: 0, sourceHandle: null, outputHandle: null })
  /**
   * Edits a backup option, and saves it in the LocalStorage
   * @param key the value to edit of the "backupOptions" object
   * @param value the value to set
   */
  function valueStorage(key: keyof BackupOptions, value: number | string | boolean) {
    // @ts-ignore
    backupOptions.current[key] = value;
    localStorage.setItem("EasyBackup-BackupOptions", JSON.stringify(backupOptions.current));
  }
  let themes = {
    isDark: true,
    dark: {
      background: "#151515",
      text: "#f0f0f0",
      second: "#303030",
      table: "#515151",
      accent: "#884c3a",
      success: "#1d8b3a",
      attention: "#9d8613"
    },
    light: {
      background: "#f0f0f0",
      text: "#212121",
      second: "#bebebe",
      table: "#969696",
      accent: "#f47f5d",
      success: "#57d278",
      attention: "#e3cc58"
    }
  }
  async function changeTheme() {
    themes.isDark = !themes.isDark;
    for (let item in themes.dark) document.documentElement.style.setProperty(`--${item}`, themes[themes.isDark ? "dark" : "light"][item as "background"]);
    let svg = await fetch("./icon.svg");
    let text = await svg.text();
    (document.getElementById("logo") as HTMLImageElement).src = URL.createObjectURL(new Blob([text.replace("#884c3a", getComputedStyle(document.body).getPropertyValue("--accent"))], { type: "image/svg+xml" }))
    localStorage.setItem("EasyBackup-Theme", themes.isDark ? "b" : "a");

  }
  useEffect(() => {
    localStorage.getItem("EasyBackup-Theme") === "a" && changeTheme();
  }, []);
  return <>
    <Header></Header>
    <i>Copy all the files in a folder to another drive, using the File System API</i><br></br><br></br>
    {state.process !== 3 ? <>
      {state.process === 0 ? <div className="container">
        <h2>Options:</h2>
        <label className="flex hcenter gap">When founding duplicates:<select defaultValue={backupOptions.current.duplicates} onChange={(e) => valueStorage("duplicates", e.currentTarget.value)}>
          <option value="skip">Skip them</option>
          <option value="overwrite">Overwrite them</option>
          <option value="ask">Ask</option>
          <option value="askcheck">Ask, but check before if duplicate files are the same</option>
          <option value="askcheckskip">Ask, but automatically skip files that are the same</option>
        </select></label><br></br>
        <label className="flex hcenter gap">Copy files that end with (you can specify more extensions by diving them with a |):<input defaultValue={backupOptions.current.fileEnd} onChange={(e) => valueStorage("fileEnd", e.currentTarget.value)} type="text"
          placeholder="Leave this field blank to copy everything"></input></label><br></br>
        <label className="flex hcenter gap">Truncate the file sizes of <input defaultValue={backupOptions.current.decimalValues} type="number" onChange={(e) => valueStorage("decimalValues", +e.currentTarget.value)}
          style={{ width: "60px" }} min="0" max="20"></input>decimal
          values</label><br></br>
        <label className="flex hcenter gap">Refresh the copied bytes every (ms): <input type="number" min="100" defaultValue={backupOptions.current.refreshCopiedBytes} onChange={(e) => valueStorage("refreshCopiedBytes", +e.currentTarget.value)}></input></label><br></br>
        <label className="flex hcenter gap">
          Wait <input type="number" style={{ width: "60px" }} min={0} onChange={(e) => valueStorage("sleep", +e.target.value)} defaultValue={(backupOptions.current.sleep)}></input> ms before copying the next file
        </label><br></br>
        <label className="flex hcenter gap">
          <input type="checkbox" onChange={(e) => valueStorage("useStream", e.target.checked)} defaultChecked={backupOptions.current.useStream}></input>Use streams while copying the file. Enable this only if you're having issues with the normal file copy.
        </label><br></br><br></br>
        <button onClick={() => updateState(prevState => { return { ...prevState, process: 1 } })}>Start selecting files</button>
      </div> :
        state.process === 1 || state.process === 2 ? <div className="container">
          <label>Now, select the folder {state.process === 1 ? "that will be copied." : "where the files will be copied"}</label><br></br><br></br>
          {typeof window.showDirectoryPicker !== "undefined" ? <>
            <label className="flex hcenter gap">
              <input type="checkbox" defaultChecked={backupOptions.current.useNormalPicker} onChange={(e) => {
                valueStorage("useNormalPicker", e.target.checked);
              }}></input><span>Don't use the File System API for this operation. {state.process === 2 && <>In this case, the files will be put into a zip file. The <a href="https://github.com/gildas-lormeau/zip.js/" target="_blank">Zip.JS library (licensed under the BSD-3 license)</a> will be used to create the zip file.</>}</span>
            </label><br></br>
          </> : state.process === 2 && <>
            <span>The files will be put into a zip file. The <a href="https://github.com/gildas-lormeau/zip.js/" target="_blank">Zip.JS library (licensed under the BSD-3 license)</a> will be used to create the zip file.</span><br></br><br></br>
          </>}
          {state.process === 1 ? <>
            <label className="flex hcenter gap" key={"PickDirectoryCheckbox"}>
              <input type="checkbox" defaultChecked={backupOptions.current.pickDirectory} onChange={(e) => {
                valueStorage("pickDirectory", e.target.checked);
              }}></input>Pick a directory (ignored if the File System API is used)
            </label><br></br><br></br>
          </> : <>
            <label className="flex hcenter gap" key={"Zip64Checkbox"}>
              <input type="checkbox" onChange={(e) => valueStorage("useZip64", e.target.checked)} defaultChecked={backupOptions.current.useZip64}></input>
              Create a ZIP64 file. Enable this if the zip file could be bigger than 4GB.
            </label>
            <br></br>
          </>}
          <button onClick={async () => {
            if (backupOptions.current.useNormalPicker) {
              const input = Object.assign(document.createElement("input"), {
                type: "file",
                multiple: true,
                webkitDirectory: state.process === 2 || backupOptions.current.pickDirectory,
                webkitdirectory: state.process === 2 || backupOptions.current.pickDirectory,
                directory: state.process === 2 || backupOptions.current.pickDirectory
              });
              input.onchange = () => {
                input.files && update(input.files);
              }
              input.click();
            } else {
              update(await window.showDirectoryPicker({ id: `EasyBackup-${state.process === 1 ? "Source" : "Destination"}Folder`, mode: `read${state.process === 2 ? "write" : ""}` }));
            }
            function update(picker: FileSystemDirectoryHandle | FileList) {
              updateState(prevState => { return { ...prevState, process: prevState.process + 1, sourceHandle: prevState.process === 1 ? picker : prevState.sourceHandle, outputHandle: prevState.process === 2 ? picker : prevState.outputHandle } })
            }
          }}>Select {state.process === 1 ? "the folder whose files will be copied" : "the folder where the files will be copied"}</button>
        </div> : <></>}
    </> : <><CopyFile options={backupOptions.current} source={state.sourceHandle as FileSystemDirectoryHandle} destination={state.outputHandle as FileSystemDirectoryHandle}></CopyFile></>
    }<br></br><br></br>
    <label className="hover" style={{ textDecoration: "underline" }} onClick={changeTheme} id="changeTheme">Change theme</label><a target="_blank" href="https://github.com/Dinoosauro/easy-backup"
      style={{ marginLeft: "10px" }}>View on GitHub</a><br></br><br></br>
    <i style={{ fontSize: "small" }}>I don't claim any responsibilities for the actions made by this tool. Icon made by Bing
      Image Creator (DALL-E
      3)</i>
  </>
}