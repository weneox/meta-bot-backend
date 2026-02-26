import "dotenv/config"; 
import express from "express"; 
import helmet from "helmet"; 
 
const app = express(); 
app.use(helmet()); 
app.use(express.json()); 
app.get("/", (req, res) => res.send("Backend is working")); 
const PORT = process.env.PORT || 8080; 
app.listen(PORT, () => console.log("listening on", PORT)); 
