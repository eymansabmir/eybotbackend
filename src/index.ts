import express from 'express';
import 'dotenv/config';

const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('API running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
