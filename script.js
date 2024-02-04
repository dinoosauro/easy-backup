if ('serviceWorker' in navigator) {
    let registration;
    const registerServiceWorker = async () => {
        registration = await navigator.serviceWorker.register('./service-worker.js', { scope: window.location.href.substring(0, window.location.href.lastIndexOf("/") + 1) });
    };
    registerServiceWorker();
}
let defaultScript = {
    input: {
        handle: null,
        files: []
    },
    output: {
        handle: null,
        files: []
    }
}
if ((window.showDirectoryPicker ?? "") === "") document.getElementById("notSupported").style.display = "";
async function openFile(isInput) {
    defaultScript[isInput ? "input" : "output"].handle = await window.showDirectoryPicker();
    document.getElementById(isInput ? "inputFolder" : "firstStep").style.opacity = "0";
    async function getDirectoryValues(handle, path) {
        for await (let entry of handle.values()) entry.kind === "file" ? defaultScript[isInput ? "input" : "output"].files.push(`${path}/${entry.name}`) : await getDirectoryValues(await handle.getDirectoryHandle(entry.name), `${path}/${entry.name}`)
    }
    await getDirectoryValues(defaultScript[isInput ? "input" : "output"].handle, "");
    defaultScript[isInput ? "input" : "output"].files = defaultScript[isInput ? "input" : "output"].files.map(e => e.substring(1)).filter(e => e.endsWith(document.getElementById("endPath").value));
    setTimeout(() => {
        document.getElementById(isInput ? "inputFolder" : "firstStep").style.display = "none";
        document.getElementById(isInput ? "outputFolder" : "secondStep").style.display = "";
        setTimeout(() => {
            document.getElementById(isInput ? "outputFolder" : "secondStep").style.opacity = "1";
            if (!isInput) startCopy();
        }, 5);
    }, 260);
}
let duplicatesFound = {
    duplicates: 0,
    finished: false
};
async function startCopy() {
    document.getElementById("progress").max = defaultScript.input.files.length;
    for (let i = 0; i < defaultScript.input.files.length; i++) {
        let item = defaultScript.input.files[i];
        document.getElementById("fileName").textContent = item;
        let getInputHandle = defaultScript.input.handle;
        let fileSplit = item.split("/");
        let fileName = fileSplit.pop();
        for (let folder of fileSplit) getInputHandle = await getInputHandle.getDirectoryHandle(folder, { create: true });
        let inputFileHandle = await getInputHandle.getFileHandle(fileName);
        let getOutputHandle = defaultScript.output.handle;
        for (let folder of fileSplit) getOutputHandle = await getOutputHandle.getDirectoryHandle(folder, { create: true });
        getOutputHandle = await getOutputHandle.getFileHandle(fileName, { create: true });;
        let file = await inputFileHandle.getFile();
        let isOriginal = defaultScript.output.files.indexOf(item) === -1 || document.getElementById("overwrite").value === "overwrite";
        let getTableContent = createTable({ file: file, duplicate: isOriginal ? undefined : await getOutputHandle.getFile(), name: item, getOutputHandle: getOutputHandle });
        if (isOriginal || document.getElementById("overwrite").value === "ask") document.getElementById("addFiles").insertBefore(getTableContent.row, isOriginal ? null : document.getElementById("addFiles").children[1]);
        if (isOriginal) {
            document.getElementById("progress").value = parseInt(document.getElementById("progress").value) + 1;
            let writableStream = await getOutputHandle.createWritable();
            await writableStream.write(file);
            await writableStream.close();
            getTableContent.afterEdit.textContent = "Copied!";
        }
    }
    duplicatesFound.finished = true;
    updateOperationStatus();
}
function updateOperationStatus() {
    if (!duplicatesFound.finished) return;
    document.getElementById("mainOperationWrite").textContent = duplicatesFound.duplicates === 0 ? "Finished!" : `Duplicates found (${duplicatesFound.duplicates})`;
}

function createTable({ file, duplicate, name, getOutputHandle }) {
    let row = document.createElement("tr");
    row.classList.add("opacity");
    let fileCell = document.createElement("td");
    if ((duplicate ?? "") !== "") {
        row.style.backgroundColor = "var(--accent)";
        duplicatesFound.duplicates++;
    }
    let fileLink = document.createElement("a");
    fileLink.textContent = name;
    fileLink.onclick = () => { getFile(file, fileLink) };
    fileCell.append(fileLink);
    console.warn(duplicate);
    function getFile(file, link) {
        if ((link.href ?? "").startsWith("blob")) return;
        let read = new FileReader();
        read.onload = () => {
            link.href = URL.createObjectURL(new Blob([read.result]));
            link.download = file.name;
            link.click();
        }
        read.readAsArrayBuffer(file);
    }
    let lastEdit = document.createElement("td");
    let lastEditFirst = document.createElement("a");
    lastEditFirst.textContent = `Source: ${file.lastModifiedDate.toLocaleString()}`;
    lastEditFirst.onclick = () => { getFile(file, lastEditFirst) };
    lastEdit.append(lastEditFirst);
    let fileSize = document.createElement("td");
    fileSize.textContent = `Source: ${manageBytes(file.size)}${document.getElementById("bytes").value.toUpperCase()}${(duplicate ?? "") !== "" ? `\n Destination:${manageBytes(duplicate.size)}${document.getElementById("bytes").value.toUpperCase()}` : ""}`;
    fileSize.style.whiteSpace = "pre-line";
    let currentAction = document.createElement("td");
    if (!duplicate) currentAction.textContent = "Copying...";
    if ((duplicate ?? "") !== "") {
        let lastEditSecond = document.createElement("a");
        lastEditSecond.textContent = `Destination: ${file.lastModifiedDate.toLocaleString()}`;
        lastEditSecond.onclick = () => { getFile(duplicate, lastEditSecond) };
        lastEdit.append(document.createElement("br"), lastEditSecond);
        let currentReplace = document.createElement("button");
        currentReplace.textContent = "Replace file";
        currentReplace.onclick = async () => {
            duplicatesFound.duplicates--;
            updateOperationStatus();
            if (document.getElementById("changeColor").value === "change") row.style.backgroundColor = "";
            document.getElementById("progress").value = parseInt(document.getElementById("progress").value) + 1;
            let writableStream = await getOutputHandle.createWritable();
            await writableStream.write(file);
            await writableStream.close();
            currentAction.textContent = "Copied!";
        }
        let ignoreBtn = document.createElement("button");
        ignoreBtn.textContent = "Ignore";
        ignoreBtn.onclick = () => {
            document.getElementById("progress").value = parseInt(document.getElementById("progress").value) + 1;
            duplicatesFound.duplicates--;
            row.style.opacity = 0;
            setTimeout(() => { row.remove() }, 260);
            updateOperationStatus();
        }
        ignoreBtn.style.backgroundColor = "var(--table)";
        currentAction.append(currentReplace, ignoreBtn);
    }
    row.append(fileCell, lastEdit, fileSize, currentAction);
    return { row: row, afterEdit: currentAction };
}
function manageBytes(byte) {
    let measure = document.getElementById("bytes").value;
    let outputFix = parseInt(document.getElementById("decimal").value);
    return (byte / (measure === "kb" || measure === "mb" || measure === "gb" || measure === "tb" ? 1024 : 1) / (measure === "mb" || measure === "gb" || measure === "tb" ? 1024 : 1) / (measure === "gb" || measure === "tb" ? 1024 : 1) / (measure === "tb" ? 1024 : 1)).toFixed(isNaN(outputFix) ? 2 : outputFix);
}
async function updateImg() {
    let svg = await fetch("./assets/icon.svg");
    svg = await svg.text();
    document.getElementById("logo").src = URL.createObjectURL(new Blob([svg.replaceAll("#884c3a", getComputedStyle(document.body).getPropertyValue("--accent"))], { type: "image/svg+xml" }))
}
updateImg();
let themes = {
    isDark: true,
    dark: {
        background: "#151515",
        text: "#f0f0f0",
        second: "#303030",
        table: "#515151",
        accent: "#884c3a"
    },
    light: {
        background: "#f0f0f0",
        text: "#212121",
        second: "#bebebe",
        table: "#969696",
        accent: "#f47f5d"
    }
}
function changeTheme() {
    themes.isDark = !themes.isDark;
    for (let item in themes.dark) document.documentElement.style.setProperty(`--${item}`, themes[themes.isDark ? "dark" : "light"][item]);
    updateImg();
    localStorage.setItem("EasyBackup-Theme", themes.isDark ? "b" : "a");
}
window.onbeforeunload = confirmExit;
function confirmExit() {
    if (!duplicatesFound.finished && defaultScript.input.files !== 0) {
        return "A copy operation is ongoing (or it's being initialized). Do you want to close?";
    }
}
if (localStorage.getItem("EasyBackup-Theme") === "a") changeTheme();
document.getElementById("changeTheme").addEventListener("click", () => changeTheme())
document.getElementById("inputFolder").addEventListener("click", () => openFile(true));
document.getElementById("outputFolder").addEventListener("click", () => openFile(false));
document.getElementById("noShowTip").addEventListener("click", () => {
    localStorage.setItem("EasyBackup-ShowDownloadTip", "a");
    document.getElementById("fileTip").style.opacity = 0;
    setTimeout(() => { document.getElementById("fileTip").style.display = "none" }, 270);
});
let appVersion = "1.0.0";
fetch("./update.txt", { cache: "no-store" }).then((res) => res.text().then((text) => { if (text.replace("\n", "") !== appVersion) if (confirm(`There's a new version of Empty Directory Look. Do you want to update? [${appVersion} --> ${text.replace("\n", "")}]`)) { caches.delete("easybackup-cache"); location.reload(true); } }).catch((e) => { console.error(e) })).catch((e) => console.error(e));