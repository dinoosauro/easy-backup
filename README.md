# easy-backup
Use the JavaScript's File System API to manage backups to folders

Try it: https://dinoosauro.github.io/easy-backup/

## Usage
<img width="888" alt="Screenshot of the main page, with the backup option and the buttons to choose the folder" src="https://github.com/Dinoosauro/easy-backup/assets/80783030/ddccc9fb-2c5e-44e4-ab5f-b65498ba3bd1">

After opening the website, you'll be able to customize the backup options. You can choose to copy the files that end with a specific string (for example, a file extension), what the website should do when finding duplicates and other minor settings.

Then, you'll need to choose the input folder (where the "new" files are stored) and the output folders (where the files selected before will be copied). After that, the website will automatically start copying them, and you'll see the progress in a table.

<img width="887" alt="Screenshot of a table with the copied files. It's possible to see the file names, the last modified date, their size and, if they are duplicates, the 'Replace file' and 'Ignore' button" src="https://github.com/Dinoosauro/easy-backup/assets/80783030/bc6d511d-c645-4c41-924d-e00e3b588638">

If you've chosen to not automatically overwrite/skip duplicates, the website will ask what to do with that file before replacing it. 
