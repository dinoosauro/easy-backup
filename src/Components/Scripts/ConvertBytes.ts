/**
 * Convert file sizes from bytes to another measure
 * @param number the size (in bytes) to convert
 * @param type the output file size (`b`, `kb`, `mb`, `gb`, `tb`)
 * @param truncate truncate the number to *this* decimal values
 * @returns a string with the file size, in the provided type
 */
export default function ConvertBytes({ number, type, truncate = 2 }: { number: number, type: string, truncate?: number }) {
    switch (type.toLowerCase()) {
        case "b":
            return number.toFixed(truncate);
        case "kb":
            return (number / 1024).toFixed(truncate);
        case "gb":
            return (number / 1024 / 1024 / 1024).toFixed(truncate);
        case "tb":
            return (number / 1024 / 1024 / 1024 / 1024).toFixed(truncate);
        default:
            return (number / 1024 / 1024).toFixed(truncate);
    }
}