const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos el asistente virtual de FIX, empresa de impermeabilización de Mendoza.

INFORMACIÓN DEL NEGOCIO:
- Servicio: Impermeabilización de techos
- Tipos de techo: losa, chapa y teja
- Zona de cobertura: Gran parte de Mendoza
- Horario de atención: Lunes a sábado de 8:00 a 20:00 hs
- Precio: $23.000 por metro cuadrado
- Garantía: 3 años en todos los trabajos
- Presupuesto: Gratuito y sin compromiso
- Instagram: https://www.instagram.com/fixing_mendoza/

PROCESO DE TRABAJO:
1. Visita al domicilio para evaluar el techo
2. Presupuesto gratuito y sin compromiso
3. Se asigna día y fecha para la ejecución
4. Ejecución del trabajo:
   - Se coloca una tela geotextil con una capa de emulsión asfáltica
   - Se agrega otra capa de emulsión asfáltica
   - Se aplica una membrana líquida del color que el cliente elija (para que pase desapercibida)

TIEMPOS DE TRABAJO:
- Un techo de entre 50 y 100 m² se termina en aproximadamente 2 días

FORMAS DE PAGO:
- 50% al iniciar el trabajo y 50% al finalizar
- Tarjeta de crédito

CÓMO RESPONDÉS:
- Sos amable, claro y directo
- Respondés en español argentino, tuteás al cliente
- Nunca inventás información que no tenés
- Cuando el cliente quiere cerrar el trabajo, pedir una visita, o hacer una consulta que no podés resolver, respondé exactamente esto: "Te paso con Faustino para coordinar los detalles. Él te va a responder a la brevedad 🙌"
- Si te preguntan algo que no sabés, también derivá a Faustino con ese mismo mensaje

PREGUNTAS FRECUENTES:
- ¿Cuánto cuesta? → $23.000 por m²
- ¿Trabajan en mi zona? → Trabajamos en la mayor parte de Mendoza
- ¿Qué tipos de techo trabajan? → Losa, chapa y teja
- ¿Cuándo pueden venir? → Lunes a sábado de 8 a 20hs, coordinamos fecha cuando hablás con Faustino
- ¿Qué garantía tienen? → 3 años de garantía en todos nuestros trabajos
- ¿Hacen presupuesto? → Sí, el presupuesto es gratuito y sin compromiso
- ¿Cómo pago? → 50/50 o tarjeta de crédito
- ¿Cuánto tarda el trabajo? → Un techo de 50 a 100 m² se hace en 2 días
- ¿Cómo es el proceso? → Visita, presupuesto y luego coordinamos el día de ejecución

Siempre respondé de forma breve y ofrecé seguir ayudando.`;

const conversaciones = new Map();

async function responderMensaje(numero, mensaje) {
  if (!conversaciones.has(numero)) {
    conversaciones.set(numero, []);
  }

  const historial = conversaciones.get(numero);
  historial.push({ role: 'user', content: mensaje });

  if (historial.length > 10) {
    historial.splice(0, historial.length - 10);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: historial,
  });

  const respuesta = response.content[0].text;
  historial.push({ role: 'assistant', content: respuesta });

  return respuesta;
}

async function enviarMensaje(numero, texto) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const mensaje = entry?.changes?.[0]?.value?.messages?.[0];

    if (!mensaje || mensaje.type !== 'text') return;

    let numero = mensaje.from;
    if (numero.startsWith('549')) {
      numero = '54' + numero.slice(3);
    }
    const texto = mensaje.text.body;

    console.log('Enviando respuesta a:', numero);
    const respuesta = await responderMensaje(numero, texto);
    await enviarMensaje(numero, respuesta);
  } catch (error) {
    console.error('Error procesando mensaje:', error.message);
    if (error.response) {
      console.error('Detalle:', JSON.stringify(error.response.data));
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot FIX activo en puerto ${PORT}`));
