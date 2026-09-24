AutoResume scrapes jobs from SIT's ReadyTalent portal and, when you ask, from LinkedIn and Indeed. It turns your details into ATS-tailored A4 resumes and cover letters. Everything is stored on your own computer.

## Downloads

| System | File |
| --- | --- |
| Windows 10/11 (64-bit) | `AutoResume-Setup-1.0.0-win-x64.exe` |
| macOS, Apple Silicon (M1 or later) | `AutoResume-1.0.0-mac-arm64.dmg` |
| macOS, Intel | `AutoResume-1.0.0-mac-x64.dmg` |

The `.zip` files hold the same Mac apps for anyone who prefers them over a disk image.

## Installing on Windows

Run the installer. Windows SmartScreen may say the publisher is unknown, because the app is not code-signed. Choose **More info**, then **Run anyway**. Allow AutoResume through the firewall if you want to use it from a tablet.

## Installing on macOS

1. Open the `.dmg` and drag **AutoResume** into **Applications**.
2. The app is not notarised by Apple, so macOS blocks the first launch. On **macOS 15 Sequoia or newer**, close the warning, go to **System Settings → Privacy & Security**, and click **Open Anyway** next to AutoResume. On older macOS, right-click AutoResume in Applications, choose **Open**, then **Open** again.
3. If macOS says the app "is damaged" or "can't be opened", run this once in Terminal, then open it normally:

```bash
xattr -dr com.apple.quarantine /Applications/AutoResume.app
```

Allow incoming connections when asked if you want to use AutoResume from a tablet. Saved ReadyTalent sign-in details are encrypted with the macOS Keychain on a Mac and with your Windows account on Windows. Full setup steps are in the [README](https://github.com/nyx-ulrix/readytalent-scraper#readme).

## What's in 1.0.0

- **ReadyTalent:** automatic SIT sign-in, the full job list with the portal's own employment-type and programme filters, pay, skills and descriptions.
- **LinkedIn and Indeed:** search runs only when you press Search, with terms you type or have the AI suggest. You can filter by job type, working mode, level, company and pay.
- **Resumes:** A4 templates, starting with Standard. Links stay clickable in PDFs, and every tailored version can be edited by hand.
- **Grounded AI** with Gemini, OpenAI, Qwen or Claude. Tailoring may only use facts from your resume and notes. Every AI action asks first and warns that it uses API tokens.
- **Tracking:** Saved and Applied tabs.
- **Tablet access:** use the laptop's app from a tablet over Wi-Fi.
