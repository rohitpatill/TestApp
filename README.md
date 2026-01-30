# Todo App

A simple Todo application with a React frontend and Node.js/Express backend connected to MongoDB.

## Directory Structure

```
├── frontend/              # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── TodoList.js
│   │   │   └── TodoForm.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── backend/               # Node.js + Express backend
│   ├── models/
│   │   └── Todo.js
│   ├── routes/
│   │   └── todos.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── .env                   # Environment variables (DO NOT COMMIT)
├── .gitignore
└── README.md
```

## Setup Instructions

### Backend

1. Navigate to backend folder:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

The backend will run on `http://localhost:5000`

### Frontend

1. Navigate to frontend folder:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`

## Environment Variables

The app uses a `.env` file in the root directory with these keys:
- `MONGODB_URI` - MongoDB connection string
- `NODE_ENV` - Environment (development/production)
- `PORT` - Backend server port
- `GITHUB_TOKEN` - For future GitHub operations

See `backend/.env.example` for reference.

## API Endpoints

- `GET /api/todos` - Get all todos
- `POST /api/todos` - Create a new todo
- `PUT /api/todos/:id` - Update a todo
- `DELETE /api/todos/:id` - Delete a todo

## Features

- Add new todos
- Mark todos as completed
- Delete todos
- Real-time updates with React
- MongoDB persistence
