# ReadFluent Chrome Extension (Persistent Side Panel)

## Load extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `browser-extension/`

## Usage
1. Open any article or YouTube page.
2. Click the extension icon once to open the **Side Panel**.
3. Keep the panel open while browsing (it stays visible).
4. Highlight text on pages — selection is auto-captured.
5. Optionally click **Quick Translate Selection** to preview translation.
6. Click **Create Lesson**.
7. If auto-open is checked, dashboard opens directly on the **Quizzes** tab.

## Notes
- Default backend is `http://127.0.0.1:8000`.
- The extension sends current tab URL + highlighted text to `POST /process-content`.
- You can also right-click selected text and choose **Send selection to ReadFluent**.
