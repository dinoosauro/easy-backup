import { ReactNode } from "react"

interface Props {
    title: string,
    children: ReactNode
}
/**
 * Create a tip for the user, with the background as an accent color
 * @param title the title of the tip
 * @param children the content to add after the title (in ReactNode)
 * @returns A ReactNode with the Tip UI
 */
export default function Tip({ title, children }: Props) {
    return <div className="container tip">
        <h3>{title}</h3>
        {children}
    </div>
}