# Admin Dashboard Testing Guide

This project now uses MongoDB for users and keeps sample documents in a small local JSON file for the document dashboard.

## What changed

- Users are stored in MongoDB instead of the one-time seeded JSON file.
- Normal signup creates an active `member` account immediately.
- Admin signup creates a `pending` request.
- A real admin must approve that request from the admin dashboard before the user can sign in as admin.

## Requirements

- Node.js installed
- MongoDB running locally or a remote MongoDB URI

## Environment variables

Create a backend `.env` file at `server/.env` with:

```env
PORT=3001
JWT_SECRET=docmind-secure-jwt-key-2024
MONGODB_URI=mongodb://127.0.0.1:27017/docmind_identity
ADMIN_EMAIL=admin@docmind.local
ADMIN_PASSWORD=Admin123!
NAS_PATH=/mnt/sda2/Docmind-v01-main
```

Notes:

- `MONGODB_URI` is now important for users and admin access.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` seed the first admin account if it does not already exist in MongoDB.
- If you change `ADMIN_EMAIL` or `ADMIN_PASSWORD` after the admin user already exists, MongoDB keeps the existing stored user. Delete that MongoDB user manually if you want to reseed it.

## Install dependencies

Frontend:

```bash
npm install
```

Backend:

```bash
cd server
npm install
```

## Start the app

Backend:

```bash
cd server
npm start
```

Frontend:

```bash
npm run dev
```

Expected URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

## First login

Use the seeded admin credentials from `.env`:

- Email: `admin@docmind.local`
- Password: `Admin123!`

If login fails:

1. Make sure MongoDB is running.
2. Check backend logs for Mongo connection errors.
3. Confirm the admin user exists in MongoDB.

## How to test the user flow

### 1. Test normal signup

1. Open `/signup`
2. Choose `Normal user`
3. Create an account
4. You should be logged in immediately
5. You should land on `/dashboard`

### 2. Test admin signup request

1. Open `/signup`
2. Choose `Admin request`
3. Create an account
4. You should be redirected to login with a message that approval is required
5. Try signing in before approval
6. Backend should reject login because the account is still pending

### 3. Approve admin request

1. Sign in as the seeded admin
2. Open `/admin`
3. Go to the `Users` tab
4. Find the pending user
5. Click `Approve`
6. The user should become active and gain the requested role

### 4. Reject admin request

1. Sign in as the seeded admin
2. Open `/admin`
3. Go to the `Users` tab
4. Find the pending user
5. Click `Reject`
6. That account should no longer be able to sign in as an approved account

### 5. Admin CRUD

As admin, test these actions from `/admin`:

1. Create a new user from `New user`
2. Edit role/status/approval/password
3. Delete a user
4. Confirm you cannot delete the currently signed-in admin

## Useful MongoDB checks

Open Mongo shell:

```bash
mongosh
```

Then:

```javascript
use docmind
db.users.find().pretty()
```

Check pending admin requests:

```javascript
db.users.find({ approvalStatus: "pending" }).pretty()
```

Delete all users except the seeded admin if you need a clean test:

```javascript
db.users.deleteMany({ email: { $ne: "admin@docmind.local" } })
```

## Why adding users in code did not work before

The old setup seeded users only once into `src/backend/src/data/app-db.json`.
After that first run, editing user data in code did not update the saved file.
That is why newly added hardcoded users were not accepted later.

## Current admin endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `POST /api/admin/users/:id/approve`
- `POST /api/admin/users/:id/reject`
- `DELETE /api/admin/users/:id`

## Quick test checklist

- MongoDB connected
- Backend starts without auth errors
- Seed admin can log in
- Normal signup logs in immediately
- Admin signup stays pending until approved
- Admin can approve/reject requests
- Admin can create/edit/delete users
- `/admin` is blocked for non-admin users
