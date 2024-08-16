const express = require('express');
const puppeteer = require('puppeteer');
const xmlbuilder = require('xmlbuilder');

const app = express();
app.use(express.json()); // Para parsear JSON en el body de la solicitud

async function extractDataAndGenerateXML() {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        console.log('Navegando a la URL...');
        await page.goto('https://avl.easytrack.com.ar/login', { waitUntil: 'domcontentloaded' });

        console.log('Esperando que el formulario de login esté disponible...');
        await page.waitForSelector('app-root app-login.ng-star-inserted');

        console.log('Ingresando credenciales...');
        await page.type('app-root app-login.ng-star-inserted #mat-input-0', 'naranja2024@transportesversari');
        await page.type('app-root app-login.ng-star-inserted #mat-input-1', 'naranja');

        console.log('Presionando Enter...');
        await page.keyboard.press('Enter');

        try {
            console.log('Esperando la navegación después de presionar Enter...');
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
        } catch (error) {
            console.error('Fallo al intentar iniciar sesión con Enter. Intentando con el botón de inicio de sesión...', error);

            console.log('Intentando hacer clic en el botón de inicio de sesión...');
            await page.click('app-root app-login.ng-star-inserted #btn-login');

            console.log('Esperando la navegación después de hacer clic en el botón de inicio de sesión...');
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        }

        async function getDataFromDashboard(url) {
            console.log(`Navegando a la URL: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            const containerSelector = 'div.ag-cell-value[aria-colindex="7"][role="gridcell"]';
            console.log('Esperando el elemento que contiene el texto...');
            try {
                await page.waitForSelector(containerSelector, { timeout: 60000 });

                console.log('Extrayendo el texto del elemento...');
                const extractedText = await page.$eval(`${containerSelector} a`, element => element.textContent.trim());

                console.log('Texto extraído:', extractedText);

                const truncatedText = extractedText.split(',').slice(0, 2).join(',');
                console.log('Texto truncado:', truncatedText);

                return { success: true, text: truncatedText };
            } catch (error) {
                console.error('No se encontró el bus en circulación.');
                return { success: false, text: '' };
            }
        }

        let result = await getDataFromDashboard('https://avl.easytrack.com.ar/dashboard/1000');
        if (!result.success) {
            result = await getDataFromDashboard('https://avl.easytrack.com.ar/dashboard/1007');
            if (result.success) {
                result.text = `El bus se encuentra detenido en ${result.text}`;
            }
        }

        if (result.success) {
            console.log('Convirtiendo el texto a XML...');
            const xml = xmlbuilder.create('root')
                .ele('address', result.text)
                .end({ pretty: true });

            console.log('XML generado:\n', xml);
            return xml;
        } else {
            console.error('No se pudo obtener el dato de ninguna de las URLs.');
            return null;
        }

    } catch (error) {
        console.error('Error al extraer el texto:', error);
        return null;
    } finally {
        console.log('Cerrando el navegador...');
        await browser.close();
    }
}

app.post('/extract-data', async (req, res) => {
    console.log('Solicitud recibida para extraer datos');
    
    const xml = await extractDataAndGenerateXML();

    if (xml) {
        console.log('Enviando respuesta con XML');
        res.set('Content-Type', 'application/xml');
        res.send(xml);
    } else {
        console.log('Error al generar el XML');
        res.status(500).send('Error al generar el XML');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});