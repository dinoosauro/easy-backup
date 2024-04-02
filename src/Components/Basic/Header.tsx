/**
 * The logo and the title of EasyBackup
 * @returns The ReactNode of the header of EasyBackup
 */
export default function Header() {
    return <div className="flex hcenter">
        <img id="logo" src="./icon.svg" width="72" height="72"></img>
        <h1 style={{ marginLeft: "10px" }}>EasyBackup</h1>
    </div>

}