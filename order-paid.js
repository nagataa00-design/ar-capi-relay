import crypto from 'crypto';
  
  const PIXEL_ID = '1805716564172576';                                                        
  const API_VERSION = 'v19.0';                     
  const CAPI_URL = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

  export const config = { api: { bodyParser: false } };

  function h(value) {
    if (!value) return undefined;
    return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
  }                                                
                                                                                                   
  function hPhone(value) {
    if (!value) return undefined;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return undefined;
    return crypto.createHash('sha256').update(digits).digest('hex');
  }
  
  function arr(v) { return v ? [v] : undefined; }

  async function getRawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];                                                                      
      req.on('data', chunk => chunks.push(chunk)); 
      req.on('end', () => resolve(Buffer.concat(chunks)));                                         
      req.on('error', reject);
    });
  }
  
  function verifyHmac(rawBody, hmacHeader, secret) {                                          
    if (!secret || !hmacHeader) return true;       
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
    } catch { return false; }
  }                                                                                           

  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();                                  
                                                   
    const token = process.env.META_CAPI_TOKEN;
    if (!token) return res.status(500).json({ error: 'META_CAPI_TOKEN not set' });

    const rawBody = await getRawBody(req);

    if (!verifyHmac(rawBody, req.headers['x-shopify-hmac-sha256'], process.env.SHOPIFY_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let order;
    try { order = JSON.parse(rawBody.toString()); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }                         

    try {                                                                                          
      const addr = order.shipping_address || order.billing_address || {};
      const orderId = String(order.id || '');
      const lineItems = order.line_items || [];                                               

      const userData = {                                                                           
        client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
      };
                                                                                              
      if (order.email)        userData.em      = arr(h(order.email));
      if (order.phone)        userData.ph      = arr(hPhone(order.phone));                         
      if (addr.first_name)    userData.fn      = arr(h(addr.first_name));
      if (addr.last_name)     userData.ln      = arr(h(addr.last_name));
      if (addr.city)          userData.ct      = arr(h(addr.city));                           
      if (addr.province_code) userData.st      = arr(h(addr.province_code));
      if (addr.zip)           userData.zp      = arr(h(addr.zip));
      if (addr.country_code)  userData.country = arr(h(addr.country_code));

      const payload = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: 'https://anatomyrelief.com',                                        
        event_id: 'purchase-' + orderId,           
        action_source: 'website',
        user_data: userData,
        custom_data: {
          value: parseFloat(order.total_price || 0),
          currency: order.currency || 'USD',                                                  
          content_type: 'product',
          content_ids: lineItems.map(li => String(li.variant_id || li.id || '')).filter(Boolean),  
          num_items: lineItems.reduce((s, li) => s + (li.quantity || 0), 0),
          order_id: orderId,
        },                                                                                    
      };
  
      const metaRes = await fetch(`${CAPI_URL}?access_token=${token}`, {                      
        method: 'POST',                            
        headers: { 'Content-Type': 'application/json' },                                           
        body: JSON.stringify({ data: [payload] }),
      });

      const result = await metaRes.json();
      if (!metaRes.ok) { console.error('Meta CAPI error:', result); return res.status(metaRes.status).json({ error: result
  }); }

      console.log('Purchase sent for order', orderId, result);
      return res.status(200).json({ ok: true, events_received: result.events_received });

    } catch (err) {                                
      console.error('order-paid error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }                                                                                         
  }
