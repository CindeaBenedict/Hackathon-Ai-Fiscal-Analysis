# Deploy pe Heroku — tot (frontend + backend)

Dacă vezi pagina **"Supply Chain Command Center — API"** cu link către Vercel în loc de aplicația cu dashboard, înseamnă că **frontend-ul nu a fost construit**: lipsește buildpack-ul Node.

## Fix în 3 pași

### 1. Setează buildpack-urile (ordinea contează)

În **Dashboard** → aplicația ta → **Settings** → **Buildpacks**:

1. Click **Add buildpack**.
2. Alege **heroku/nodejs** și salvează.
3. Click **Add buildpack** din nou.
4. Alege **heroku/python** și salvează.

**Ordinea trebuie să fie exact:**
- 1) **heroku/nodejs**
- 2) **heroku/python**

Sau din CLI (în repo):

```bash
heroku buildpacks:clear
heroku buildpacks:add --index 1 heroku/nodejs
heroku buildpacks:add --index 2 heroku/python
heroku buildpacks
```

Trebuie să vezi:
```
1. heroku/nodejs
2. heroku/python
```

### 2. Variabile (opțional)

**Settings** → **Config Vars**:

- **VITE_API_BASE_URL** — lasă **gol** sau șterge-o (pentru full app pe același domeniu).

### 3. Redeploy

```bash
git push heroku main
```

După build, în **More** → **View logs** ar trebui să vezi:  
`Frontend mounted from /app/frontend/dist`.  
Dacă vezi `Frontend dist not found...`, buildpack-ul Node lipsește sau e sub Python — refă pașii de la 1.
