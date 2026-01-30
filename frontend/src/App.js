import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TodoList from './components/TodoList';
import TodoForm from './components/TodoForm';
import './App.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/todos');
      setTodos(response.data);
    } catch (err) {
      console.error('Error fetching todos:', err);
    }
    setLoading(false);
  };

  const addTodo = async (title) => {
    try {
      const response = await axios.post('/api/todos', { title });
      setTodos([response.data, ...todos]);
    } catch (err) {
      console.error('Error adding todo:', err);
    }
  };

  const toggleTodo = async (id, completed) => {
    try {
      const response = await axios.put(`/api/todos/${id}`, { completed: !completed });
      setTodos(todos.map(todo => (todo._id === id ? response.data : todo)));
    } catch (err) {
      console.error('Error updating todo:', err);
    }
  };

  const deleteTodo = async (id) => {
    try {
      await axios.delete(`/api/todos/${id}`);
      setTodos(todos.filter(todo => todo._id !== id));
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  return (
    <div className="App">
      <h1>My Todo App</h1>
      <TodoForm onAdd={addTodo} />
      {loading ? <p>Loading...</p> : <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />}
    </div>
  );
}

export default App;
