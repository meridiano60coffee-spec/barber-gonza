const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

const ARCHIVO_DB = path.join(__dirname, 'turnos.json');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

client.on('qr', async (qr) => {
    console.log("Motor de WhatsApp esperando vinculación remota...");
});
client.on('ready', () => { console.log('✅ WhatsApp listo.'); });
client.initialize();

let turnosSimulados = [];

async function cargarBaseDeDatos() {
    try {
        await fs.access(ARCHIVO_DB);
        const data = await fs.readFile(ARCHIVO_DB, 'utf-8');
        turnosSimulados = JSON.parse(data);
        console.log(`📦 Base de datos cargada. Turnos: ${turnosSimulados.length}`);
    } catch (error) {
        console.log("🗃️ Creando base de datos nueva...");
        await fs.writeFile(ARCHIVO_DB, JSON.stringify([], null, 2), 'utf-8');
    }
}
cargarBaseDeDatos();

app.get('/api/turnos-ocupados', (req, res) => {
    const { fecha } = req.query;
    const ocupados = turnosSimulados.filter(t => t.fecha === fecha).map(t => t.hora);
    res.json(ocupados);
});

app.post('/api/iniciar-pago', (req, res) => {
    const { fecha, hora } = req.body;
    const existe = turnosSimulados.some(t => t.fecha === fecha && t.hora === hora);
    if (existe) return res.status(400).json({ error: "Este horario ya fue tomado." });
    const idPreferenciaSimulado = "MP-" + Math.floor(Math.random() * 900000 + 100000);
    res.json({ idPreferencia: idPreferenciaSimulado });
});

app.post('/webhook', async (req, res) => {
    res.status(200).send("Notificación recibida");
});

app.post('/api/confirmar-pago-exitoso', async (req, res) => {
    const { nombre, telefono, fecha, hora, servicio } = req.body;
    const existe = turnosSimulados.some(t => t.fecha === fecha && t.hora === hora);
    if (existe) return res.status(400).json({ error: "Error: El horario se ocupó." });
    
    const nuevoTurno = { id: "T-" + Date.now(), nombre, telefono, fecha, hora, servicio, estado_pago: 'Pagado', fecha_registro: new Date().toISOString() };
    turnosSimulados.push(nuevoTurno);
    
    try {
        await fs.writeFile(ARCHIVO_DB, JSON.stringify(turnosSimulados, null, 2), 'utf-8');
        const chatId = `549${telefono.replace(/\D/g, '')}@c.us`;
        const mensajeWa = `¡Hola ${nombre}! 👋\n\nTu turno de las ${hora} está confirmado.`;
        await client.sendMessage(chatId, mensajeWa);
        res.json({ estatus: "OK" });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

// Usamos el puerto que Render nos da, o 3000 por defecto
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`Servidor en ejecución en puerto ${PORT}`); 
});