# 🦆 DuckPilot

**DuckPilot is an AI coding agent that lives in your terminal.**
You describe what you want in plain language, and it does the work: it reads your files, writes new ones, edits existing code, and runs commands to check that everything works. It is powered by [Groq](https://groq.com), so replies are fast.

```
❯ create a todo app in Python with a tkinter GUI, save tasks to tasks.json

● Write(todo_app/main.py)
  ⎿  Wrote 142 lines to todo_app/main.py
     + import tkinter as tk
     + ...

● Run(python -m py_compile todo_app/main.py)
  ⎿  (no output)

● Done. I created todo_app/main.py. Run it with: python todo_app/main.py
```

---

## Quick start

**1. Save your Groq API key (once)**

Get a key from [console.groq.com](https://console.groq.com/keys), then:

```bash
duckpilot -key gsk_your_api_key
```

The key is stored in `~/.duckpilot/config.json`.

**2. Go to your project folder and start the agent**

```bash
cd my-project
duckpilot run
```

**3. Type what you want**

```
❯ add a README to this project
```

That's it. DuckPilot works inside the folder where you started it.

---

## Commands

| Command | What it does |
|---|---|
| `duckpilot run` | Start the interactive agent in the current folder |
| `duckpilot run "<task>"` | Run one task and exit |
| `duckpilot -key <api-key>` | Save your Groq API key |
| `duckpilot --version` | Show the version |
| `duckpilot --help` | Show help |

### One-shot mode

Give DuckPilot a task directly, without opening the interactive screen:

```bash
duckpilot run "add type hints to utils.py"
duckpilot run "find and fix the bug in login.js, then run the tests"
```

---

## Using the interactive mode

After `duckpilot run` you will see a welcome box and a prompt (`❯`). Type a request and press Enter.

### What happens during a task

DuckPilot works in a loop: it thinks, uses a tool, looks at the result, and continues until the task is done. Each step is printed so you can follow along:

| You see | Meaning |
|---|---|
| `● Read(file)` | It read a file |
| `● Write(file)` | It created or overwrote a file (a preview is shown) |
| `● Update(file)` | It edited part of a file (removed lines in red, added lines in green) |
| `● List(folder)` | It listed a folder |
| `● Run(command)` | It wants to run a command (asks for your permission) |
| `✻ Worked for 12s · 5 tool calls` | Summary when the task finishes |

### Slash commands

Type these at the prompt:

| Command | What it does |
|---|---|
| `/help` | Show the available commands |
| `/clear` | Forget the conversation and start fresh |
| `/model` | Show the current model |
| `/model <name>` | Switch to another model for this session |
| `/exit` | Quit (`exit` and `quit` also work) |

### Keyboard

| Keys | What it does |
|---|---|
| `Enter` | Send your message |
| `Ctrl+C` | Stop the task that is running |
| `Ctrl+C` twice (at the prompt) | Exit DuckPilot |

You can **paste multi-line prompts**. They are sent as a single message.

DuckPilot remembers the conversation until you use `/clear` or exit, so you can follow up:

```
❯ create hello.py that prints a greeting
❯ now make it ask for the user's name first
```

---

## Where it works: the working folder

DuckPilot works in **the folder you were in when you started it**, no matter where DuckPilot itself is installed.

```bash
cd D:\Projects\site-a
duckpilot run          # works on site-a

cd D:\Projects\site-b
duckpilot run          # works on site-b
```

The welcome box shows the current folder (`Folder`), so you can always check.

### Using another location

If you name a different location in your request, DuckPilot uses it:

```
❯ create a Flask app in D:\Projects\api
❯ save the notes on my Desktop
```

You can also use `~` for your home folder. Anything **outside** the working folder asks for your permission first (see below).

---

## Permissions and safety

DuckPilot can change files and run commands, so it asks before the risky parts.

**Commands always ask.** Before running anything it shows the command in a box:

```
╭─ Run command ────────────────────╮
│ python -m py_compile main.py     │
╰──────────────────────────────────╯
  Do you want to proceed?
  1. Yes
  2. Yes, and don't ask again this session for this exact command
  3. No
```

- `1` runs it once.
- `2` runs it and remembers that exact command for this session.
- `3` (or just Enter) refuses. The agent is told and can try another approach.

**Outside the working folder asks too.** Reading, writing, or listing a path outside the folder you started in asks for permission. Choosing option `2` allows that project folder for the rest of the session.

**Inside the working folder** files are created and edited right away, with every change printed on screen. Use git to review or undo changes.

**Always blocked:** DuckPilot cannot access its own settings folder (`~/.duckpilot`), because it contains your API key.

Good habits:

- Start DuckPilot inside your project folder, not in your home folder or a drive root.
- Read each command before you approve it.
- Commit your work with git before big tasks.

---

## Writing good requests

DuckPilot does best with clear, specific requests.

| Instead of | Try |
|---|---|
| `make a website` | `create a portfolio website with index.html, style.css and script.js; dark theme; a contact form` |
| `fix it` | `login.py crashes when the password is empty. Find the cause and fix it, then run it to check.` |
| `improve my code` | `refactor utils.py into smaller functions, keep the behavior the same, and run the tests` |

Tips:

- **Say how to verify**: "run it", "run the tests", "check the syntax with `python -m py_compile main.py`". DuckPilot will test its own work and fix mistakes.
- **Name the files** you want, and the folder if it matters.
- **Split big jobs** into steps and follow up. It works better than one giant request.
- **Don't ask it to start GUI apps or servers.** Commands that never finish would hang, so they stop after 60 seconds. Ask it to build the app, then run the app yourself.
- When it makes a mistake, just tell it what is wrong: `the Delete key doesn't work, fix it`.

### Example requests

```
list the files here and explain what this project does
create a Python script that renames all .jpeg files in a folder to .jpg
read server.js and add error handling to every route
write unit tests for calculator.py and run them
create a .gitignore for a Node.js project
```

---

## Changing the model

The default model is `openai/gpt-oss-120b`.

Switch for the current session:

```
❯ /model llama-3.3-70b-versatile
```

Or set it permanently by adding `model` to `~/.duckpilot/config.json`:

```json
{
  "apiKey": "gsk_...",
  "model": "openai/gpt-oss-120b"
}
```

Available models change over time. See the list at [console.groq.com/docs/models](https://console.groq.com/docs/models).

---

## Limits to know about

- Up to **30 steps** per request. If a task is not finished, tell it to continue.
- Commands time out after **60 seconds**.
- Long file contents and command output are shortened before being sent to the model.
- The conversation is kept only while the program is running.
- The model can make mistakes. Review important changes.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| `No API key found` | Run `duckpilot -key <your-key>` |
| `Your API key looks invalid` (401) | The key is wrong or revoked. Create a new one and run `duckpilot -key` again |
| `Rate limit reached` (429) | Wait a moment, or switch model with `/model` |
| A reply is cut off | DuckPilot notices and asks the model to continue in smaller parts. If it keeps happening, ask for smaller steps |
| It writes in the wrong folder | Check the `Folder` line in the welcome box. Start DuckPilot from the right folder, or name the full path in your request |
| Strange symbols or no colors | Use Windows Terminal or the VS Code terminal. Set `NO_COLOR=1` to turn colors off |

---

## License

Copyright 2026 Amr Mohamed Hasanain.
Licensed under the [Apache License 2.0](LICENSE).