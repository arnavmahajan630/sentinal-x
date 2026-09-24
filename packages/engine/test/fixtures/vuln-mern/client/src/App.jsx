import axios from 'axios';
export default function App() {
  const load = () => axios.get('/api/orders/1');
  return <button onClick={load}>load</button>;
}
