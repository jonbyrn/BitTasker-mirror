# Gitea → GitLab migration guide

This guide is for developers who have been using **only Gitea** so far (pushing and pulling from Gitea as `origin`). We are moving the team to **GitLab** as the main remote. You do not need any existing GitLab setup—this guide walks you through access, SSH keys, and switching your repo to GitLab step by step.

**Assumptions:** Your `origin` points to Gitea. You have not added GitLab as a remote yet. The BitTasker repo on GitLab is in sync with Gitea (sync bot), so the history is the same.

**Repos:**
- **GitLab (new primary):** `git@gitlab.com:bittasker/BitTasker.git`
- **Gitea (legacy):** `ssh://git@gitea.bittasker.com:2233/scott/Bittasker.git`

If you already have GitLab set as `origin`, you can skip to [Section 4](#4-pre-validations-in-your-repo) and only run the pre-validations and post-validations.

---

## 1. Validate access to GitLab and the BitTasker repo

Before touching Git or SSH, confirm you can see the project in GitLab.

### 1.1 Log in to GitLab

1. Open **https://gitlab.com** in your browser.
2. Log in with your GitLab account (or create one if your team lead has invited you).
3. If you use SSO or a group, use the login method your team uses.

### 1.2 Confirm you can see the BitTasker project

1. Go to: **https://gitlab.com/bittasker/BitTasker**
2. You should see the BitTasker project (repository).
3. If you get **404** or “not found”:
   - Ask your team lead or admin to add you to the **bittasker** group or give you access to the **BitTasker** project.
   - Do not continue until you can open that URL and see the repo.

### 1.3 Check you have Developer (or higher) access

- In the project, look for a **Clone** button and a **Code** dropdown. You should be able to see the clone URL (e.g. `git@gitlab.com:bittasker/BitTasker.git`).
- If you only have “Guest” or “Reporter” access, ask for **Developer** (or higher) so you can push.

**✓ Done when:** You can open https://gitlab.com/bittasker/BitTasker and you have permission to clone/push.

---

## 2. Set up SSH keys with GitLab

GitLab uses SSH so your machine can push and pull without typing a password every time. You will either use an **existing** SSH key or **create a new one**, then add it to GitLab.

### 2.1 Check if you already have an SSH key

In a terminal, run:

```bash
ls -la ~/.ssh
```

Look for a file like:

- `id_ed25519.pub` or `id_rsa.pub` (the `.pub` file is the one you add to GitLab).

If you see `id_ed25519.pub` or `id_rsa.pub`, you already have a key. Skip to [2.3 Add your public key to GitLab](#23-add-your-public-key-to-gitlab).

### 2.2 Create a new SSH key (only if you don’t have one)

Run (replace with your GitLab email):

```bash
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_ed25519
```

- When it asks for a passphrase, you can press Enter for none, or set one for extra security.
- This creates `~/.ssh/id_ed25519` (private) and `~/.ssh/id_ed25519.pub` (public). You only ever share the **public** one.

### 2.3 Add your public key to GitLab

1. Copy the **contents** of your public key to the clipboard:
   - **macOS:** `pbcopy < ~/.ssh/id_ed25519.pub` (or `pbcopy < ~/.ssh/id_rsa.pub` if you use RSA).
   - **Linux (X11):** `xclip -selection clipboard < ~/.ssh/id_ed25519.pub` (or install `xclip` if needed).
   - Or open the file and copy the whole line: `cat ~/.ssh/id_ed25519.pub`.
2. In GitLab: click your **avatar (top right)** → **Preferences** → **SSH Keys** (left sidebar).
3. **Key:** paste the copied line. **Title:** e.g. “My laptop” or “Cursor / work machine”.
4. Click **Add key**.

### 2.4 Test that GitLab recognizes your key

In a terminal, run:

```bash
ssh -T git@gitlab.com
```

- First time you may see “Are you sure you want to continue connecting? (yes/no)” → type **yes** and Enter.
- You want to see something like: **“Welcome to GitLab, @your-username!”**. That means SSH is set up correctly.
- If you see **“Permission denied (publickey)”**: your key is not added or not used. Double-check you added the **public** key (`.pub`) in GitLab and that you’re using the same key (e.g. `ssh-add -l` and `ssh-add ~/.ssh/id_ed25519` if needed).

**✓ Done when:** `ssh -T git@gitlab.com` prints a welcome message with your GitLab username.

---

## 3. Before you start: what we’ll do in Git

In the next sections we will:

1. **Save your work** (commit or stash).
2. **Sync with Gitea** so your local repo is up to date with what’s on Gitea.
3. **Add GitLab** as a remote and then **make GitLab your new `origin`** (so `git push` and `git pull` use GitLab).
4. **Check** that push and pull work with GitLab.

You will still have the Gitea remote (renamed to `gitea`) so you can keep it as backup or remove it later.

---

## 4. Pre-validations (in your repo)

Do this in the folder where you have the BitTasker repo cloned (from Gitea).

### 4.1 Save your work

- **Commit** any changes you want to keep:
  ```bash
  git status
  git add -A
  git commit -m "WIP: save before GitLab migration"
  ```
- Or **stash** them if you prefer not to commit yet:
  ```bash
  git stash push -m "before GitLab migration"
  ```

### 4.2 Push and pull with Gitea so you’re up to date

Your current remote is Gitea (as `origin`). Push your branch and pull the latest so your local repo matches Gitea:

```bash
git push origin HEAD
git fetch origin
git pull origin dev
```

(If your main branch is `main` or `master`, use that instead of `dev`.)

### 4.3 Note your current branch

You’ll need this when we switch remotes. Run:

```bash
git branch --show-current
```

Remember this branch name (e.g. `dev`, `feat/my-feature`).

**✓ Done when:** Your work is saved and your branch is in sync with Gitea.

---

## 5. Add GitLab and make it your primary remote

Follow these steps in order.

### 5.1 Add GitLab as a remote named `gitlab`

```bash
git remote add gitlab git@gitlab.com:bittasker/BitTasker.git
```

### 5.2 Fetch from GitLab (download GitLab’s branches and commits)

```bash
git fetch gitlab
```

If this fails with “Permission denied” or “Could not read from remote”, go back to [Section 2](#2-set-up-ssh-keys-with-gitlab) and fix the SSH test (`ssh -T git@gitlab.com`).

### 5.3 Rename your current `origin` to `gitea`

This keeps your existing Gitea URL under the name `gitea` instead of `origin`:

```bash
git remote rename origin gitea
```

### 5.4 Rename `gitlab` to `origin`

So that `origin` now points to GitLab (and `git push` / `git pull` use GitLab by default):

```bash
git remote rename gitlab origin
```

### 5.5 Fetch from the new `origin` (GitLab)

```bash
git fetch origin
```

### 5.6 Set your current branch to track GitLab’s branch

Replace `YOUR_BRANCH` with the branch name you noted in 4.3 (e.g. `dev`, `feat/my-feature`):

```bash
git branch --set-upstream-to=origin/YOUR_BRANCH YOUR_BRANCH
```

Example if your branch is `feat/my-feature`:

```bash
git branch --set-upstream-to=origin/feat/my-feature feat/my-feature
```

**✓ Done when:** `git remote -v` shows `origin` pointing to `git@gitlab.com:bittasker/BitTasker.git` and `gitea` pointing to the Gitea URL.

---

## 6. Post-validations (check that everything works)

### 6.1 Check remotes

```bash
git remote -v
```

You should see:

- **origin** → `git@gitlab.com:bittasker/BitTasker.git` (fetch and push)
- **gitea** → `ssh://git@gitea.bittasker.com:2233/...` (fetch and push)

### 6.2 Check that your branch tracks GitLab

```bash
git status
```

It should say something like “Your branch is up to date with 'origin/your-branch-name'” or “ahead”/“behind” by N commits. It should **not** say “gitea/…” for the upstream.

### 6.3 Test pull from GitLab

```bash
git fetch origin
git log -1 origin/dev
```

You should see the latest commit on `dev` from GitLab (no errors).

### 6.4 Test push to GitLab

Push your current branch once to confirm you can write to GitLab:

```bash
git push origin $(git branch --show-current)
```

If your branch doesn’t exist on GitLab yet, use:

```bash
git push -u origin $(git branch --show-current)
```

- If this works, GitLab has your branch and you’re done.
- If you get **“Permission denied”** or **“access denied”**, check [Section 2](#2-set-up-ssh-keys-with-gitlab) again and that your GitLab user has Developer (or higher) access to the project.

**✓ Done when:** You can `git fetch origin` and `git push origin <your-branch>` without errors.

---

## 7. After migration: how to work with GitLab

- **Push:** `git push` (or `git push origin <branch>`).
- **Pull / update your branch:** `git fetch origin` then `git merge origin/<branch>` or `git rebase origin/<branch>`.
- **Create a new branch from latest dev:**  
  `git fetch origin` then `git checkout -b feat/my-new-feature origin/dev`.
- **Do not push to Gitea anymore.** The team’s source of truth is now GitLab.

Optional: if you’re sure you won’t need Gitea in this repo, you can remove it:

```bash
git remote remove gitea
```

You can add it back later with:

```bash
git remote add gitea ssh://git@gitea.bittasker.com:2233/scott/Bittasker.git
```

---

## 8. Quick reference (for Cursor or helpers)

| Step | What to do |
|------|------------|
| 1 | Confirm access: open https://gitlab.com/bittasker/BitTasker in browser. |
| 2 | SSH: have `id_ed25519.pub` or `id_rsa.pub`; add it in GitLab → Preferences → SSH Keys. |
| 3 | Test SSH: `ssh -T git@gitlab.com` → “Welcome to GitLab, @username!” |
| 4 | In repo: commit or stash, then `git push origin HEAD` and `git pull origin dev`. |
| 5 | Add GitLab: `git remote add gitlab git@gitlab.com:bittasker/BitTasker.git` then `git fetch gitlab`. |
| 6 | Switch origin: `git remote rename origin gitea` then `git remote rename gitlab origin` then `git fetch origin`. |
| 7 | Set upstream: `git branch --set-upstream-to=origin/$(git branch --show-current) $(git branch --show-current)`. |
| 8 | Test: `git push origin $(git branch --show-current)`. |

---

## 9. If something goes wrong

- **“Permission denied (publickey)” when running `git fetch gitlab` or `git push origin`**  
  GitLab is not accepting your SSH key. Run `ssh -T git@gitlab.com` and fix until you see the welcome message. Make sure the **public** key (`.pub`) is in GitLab → Preferences → SSH Keys.

- **“404” or “project not found” in browser or Git**  
  You don’t have access to the BitTasker project. Ask your team lead or admin to add you to the **bittasker** group or give you Developer access to the BitTasker project.

- **“Updates were rejected” or “non-fast-forward” when pushing**  
  The branch on GitLab has commits you don’t have. Run `git fetch origin` then `git pull origin <branch>` (or `git rebase origin/<branch>`) to update, then push again. Do not use `git pull` without specifying the branch if your repo has `pull.rebase` set, to avoid accidental rebases.

- **Branch doesn’t exist on GitLab**  
  Push it once with: `git push -u origin $(git branch --show-current)`.

- **You removed `gitea` and need it again**  
  `git remote add gitea ssh://git@gitea.bittasker.com:2233/scott/Bittasker.git` then `git fetch gitea`.

If you’re stuck, share the exact command you ran and the full error message with your team or use Cursor to debug.
