# Setting up the nightly evidence checks on the Mac Mini

The Mini runs `evidence/NIGHTLY.md` every night (4 sections from `evidence/queue.json`). It works in this
same project folder, which reaches the Mini through iCloud (Desktop & Documents), and writes only inside
`evidence/`. The MacBook commits and publishes the results.

## One-time setup on the Mac Mini

1. **Same files, same path.** In Terminal on the Mini, run `ls ~/Documents/Claude/Projects`: it should list
   `RMC-NICU-Handbook` and `Intuitive Neonatology` (the evidence tools live in the second). `echo $HOME` should
   print `/Users/fschou`; if it prints something else, the paths in the agent files need changing first.
2. **Keep the files on the Mini.** In Finder, right-click `RMC-NICU-Handbook` and `Intuitive Neonatology`
   (in Documents › Claude › Projects) and choose **Keep Downloaded**, so iCloud doesn't swap them for
   placeholders overnight.
3. **Python.** `python3 --version` in Terminal. If macOS offers to install the command line developer tools,
   accept.
4. **Claude app.** Install it, sign in with the same account, and open a Code session on the folder
   `~/Documents/Claude/Projects/RMC-NICU-Handbook`.
5. **Create the schedule.** In that session, send:

   > Create a scheduled task named "Nightly evidence checks" that runs every day at 12 AM (midnight) with this prompt:
   > "Follow /Users/fschou/Documents/Claude/Projects/RMC-NICU-Handbook/evidence/NIGHTLY.md exactly. It is
   > self-contained: run the next 4 pending sections of evidence/queue.json through the three-agent evidence
   > check, write only inside evidence/, no git writes and no deploys, and end with the night's summary."

   Let it run without asking for permission (it searches PubMed, fetches papers, runs Python and writes
   files), or approve its first run by hand.
6. **Stay awake.** System Settings › Energy: turn on "Prevent automatic sleeping when the display is off".
   Leave the Claude app open; a task that is due while the app is closed runs when it next opens.

## Each morning (on the MacBook)

Ask Claude to "publish last night's evidence checks": it reads `evidence/_work/nightly-log.md`, commits the
new `evidence/<chapter>/*.json` and `queue.json`, rebuilds, and deploys the preview and public sites.
n 