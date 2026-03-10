"use strict";
/**
 * typhoonService.js
 * ------------------
 * Typhoon 2.5 (OpenAI-compatible API) with Prompt-based Tool Calling
 * (Typhoon API does not support OpenAI-style `tools` parameter,
 *  so we embed tool definitions in the system prompt and parse JSON from responses)
 * Base URL: https://api.opentyphoon.ai/v1
 */

const TYPHOON_API_URL = (process.env.TYPHOON_API_URL || "https://api.opentyphoon.ai/v1").replace(/\/$/, "");
const TYPHOON_MODEL   = process.env.TYPHOON_MODEL || "typhoon-v2.5-30b-a3b-instruct";

// ─── Low-level API call (NO tools parameter) ─────────────────────────────────
const callTyphoon = async (messages, isRetry = false) => {
    const apiKey = process.env.TYPHOON_API_KEY;
    if (!apiKey) throw new Error("TYPHOON_API_KEY is not set");

    // Typhoon vllm: max_tokens = total context (prompt + completion), NOT output-only
    // System prompt alone is ~3100 tokens, so must be well above that
    const maxTokens = isRetry ? 6144 : 8192;

    const payload = {
        model: TYPHOON_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.4,
    };

    const res = await fetch(`${TYPHOON_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const errText = await res.text();
        // Retry with aggressively trimmed history if still hitting token limit
        if (!isRetry && errText.toLowerCase().includes("token")) {
            console.warn("[Typhoon] Token limit hit, retrying with trimmed history (system + last 2 msgs)...");
            const trimmed = [messages[0], ...messages.slice(-2)]; // system prompt + last 2 msgs only
            return callTyphoon(trimmed, true);
        }
        throw new Error(`Typhoon API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "(ไม่มีคำตอบ)";
};

// ─── Parse tool calls from model text output ─────────────────────────────────
/**
 * Extract tool calls from model output.
 * Uses brace-counting (not lazy regex) to handle nested JSON: {"arguments":{}}
 */
const parseToolCalls = (text) => {
    const calls = [];
    // Find all [TOOL_CALL]...[/TOOL_CALL] blocks
    const blockRegex = /\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/g;
    let blockMatch;

    while ((blockMatch = blockRegex.exec(text)) !== null) {
        const inner = blockMatch[1].trim();

        // Use brace-counting to extract balanced JSON (handles nested braces)
        let depth = 0, start = -1, end = -1;
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === "{") {
                if (depth === 0) start = i;
                depth++;
            } else if (inner[i] === "}") {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }

        if (start === -1 || end === -1) {
            console.warn("[parseToolCalls] no balanced JSON in block:", inner.substring(0, 80));
            continue;
        }

        const jsonStr = inner.substring(start, end + 1);
        try {
            const parsed = JSON.parse(jsonStr);
            console.log("[parseToolCalls] ✓ parsed tool:", parsed.name, JSON.stringify(parsed.arguments));
            if (parsed.name) {
                calls.push({ name: parsed.name, arguments: parsed.arguments || {} });
            }
        } catch (e) {
            console.error("[parseToolCalls] JSON parse error:", e.message, "| str:", jsonStr.substring(0, 80));
        }
    }
    return calls;
};

/**
 * Chat with prompt-based tool calling (agentic loop).
 * Runs up to maxIter rounds of tool calls automatically.
 *
 * @param {Array}    messages     - History + current user message (OpenAI format)
 * @param {string}   systemPrompt - System prompt (includes tool definitions)
 * @param {Array}    _tools       - (unused, kept for API compat)
 * @param {Function} executeTool  - async (name, args) => any (result)
 * @param {number}   maxIter      - Max tool-call rounds (default 4)
 * @returns {Promise<{ reply: string, toolsUsed: string[] }>}
 */
const chatWithTools = async (messages, systemPrompt, _tools = [], executeTool, maxIter = 4) => {
    const history = [
        { role: "system", content: systemPrompt },
        ...messages,
    ];
    const toolsUsed = [];

    for (let i = 0; i < maxIter; i++) {
        const responseText = await callTyphoon(history);

        // Check for tool calls in the response
        const toolCalls = parseToolCalls(responseText);

        if (toolCalls.length === 0) {
            // No tool calls — this is the final answer
            // Clean any leftover markers just in case
            const cleanReply = responseText.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "").trim();
            return { reply: cleanReply || responseText, toolsUsed };
        }

        // Push assistant message into history
        history.push({ role: "assistant", content: responseText });

        // Execute each tool call and push results
        for (const tc of toolCalls) {
            toolsUsed.push(tc.name);
            let result;
            try {
                result = await executeTool(tc.name, tc.arguments);
            } catch (err) {
                result = { error: err.message };
            }

            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            history.push({
                role: "user",
                content: `[TOOL_RESULT] name="${tc.name}"\n${resultStr}\n[/TOOL_RESULT]`,
            });
        }
    }

    // Exhausted iterations — get final answer
    history.push({
        role: "user",
        content: "กรุณาสรุปคำตอบสุดท้ายจากข้อมูลที่ได้ (ห้ามเรียก tool เพิ่มแล้ว)",
    });
    const finalText = await callTyphoon(history);
    const cleanFinal = finalText.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "").trim();
    return { reply: cleanFinal || finalText, toolsUsed };
};

// ─── TOOLS is kept as a constant for reference but not sent to API ───────────
const TOOLS = [
    { name: "get_categories",          description: "ดึงรายการหมวดหมู่สินค้าทั้งหมดในร้าน พร้อมจำนวนสินค้าในแต่ละหมวด",              params: "ไม่มี parameter" },
    { name: "get_products_by_category",description: "ดึงสินค้าทั้งหมดในหมวดหมู่ที่ระบุ ใช้เมื่อลูกค้าต้องการดูสินค้าในหมวดหมู่ใดหมวดหมู่หนึ่ง", params: "category_id (number, optional), category_name (string, optional): ชื่อหมวดหมู่" },
    { name: "search_products",         description: "ค้นหาสินค้าด้วยคำค้นหาอิสระ ใช้เมื่อลูกค้าค้นหาสินค้าที่ไม่ได้กำหนดหมวดหมู่",  params: "query (string, required): คำค้นหา" },
    { name: "get_product_details",     description: "ดูรายละเอียดสินค้า variants ราคา สต็อก",                                         params: "product_id (number, required): ID ของสินค้า" },
    { name: "add_product_to_cart",     description: "เพิ่มสินค้าลงตะกร้าโดยระบุชื่อสินค้า — ใช้เฉพาะเมื่อลูกค้าบอกชัดว่าต้องการ 'เพิ่ม' 'ซื้อ' 'ใส่ตะกร้า'", params: "product_name (string, required): ชื่อสินค้า, quantity (number, default 1): จำนวน" },
    { name: "remove_from_cart",        description: "ลบสินค้าออกจากตะกร้าเมื่อลูกค้าสั่งให้เอาออก ลด ลบ หรือไม่เอา", params: "product_name (string, required): ชื่อสินค้าที่ต้องการลบ" },
    { name: "update_cart_quantity",    description: "อัพเดทจำนวนสินค้าในตะกร้าเมื่อลูกค้าบอกให้เปลี่ยนจำนวน", params: "product_name (string, required): ชื่อสินค้า, quantity (number, required): จำนวนใหม่" },
    { name: "get_my_addresses",        description: "ดึงที่อยู่จัดส่งของลูกค้าจาก profile — ใช้เมื่อลูกค้าพูดว่าชำระเงิน สั่งซื้อ จ่ายเงิน",                       params: "ไม่มี parameter" },
    { name: "checkout_order_in_chatbot", description: "สร้างคำสั่งซื้อเมื่อลูกค้าเลือกที่อยู่และวิธีชำระเงินเรียบร้อยแล้ว", params: "address_id (number, required): ID ของที่อยู่, payment_method (string, required): 'promptpay' หรือ 'cod'" },
    { name: "get_my_orders",           description: "ดูคำสั่งซื้อของลูกค้าที่ล็อกอิน",                                               params: "ไม่มี parameter" },
];

/**
 * Build system prompt with embedded tool definitions.
 * @param {Object|null} customer - { name, phone } or null
 * @param {Array} cartItems - Array of items currently in the user's cart
 */
const buildSystemPrompt = (customer = null, cartItems = []) => {
    // Build tool descriptions for the prompt
    const toolDescriptions = TOOLS.map(t =>
        `- **${t.name}**: ${t.description}\n  Parameters: ${t.params}`
    ).join("\n");

    let prompt = `คุณคือผู้ช่วย AI ของร้านค้าออนไลน์ "Chambot Store" ที่ตอบภาษาไทยเป็นธรรมชาติ
ใช้ภาษาสุภาพแต่เป็นกันเอง ตอบกระชับได้ใจความ (ปกติ 2-3 ประโยค)

**กฎเหล็กแบบตายตัว (ANTI-HALLUCINATION STRICT ROLE):**
- คุณต้องพิจารณาคำตอบจากข้อมูล Database ที่ Tool ส่งกลับมาให้เท่านั้น
- หาก Data จาก Tool แจ้งว่า "ไม่พบสินค้า" หรืออาร์เรย์ว่าง คุณต้องแจ้งลูกค้าตามตรงว่า "ขออภัยค่ะ สินค้าที่ระบุหมด หรือไม่มีในร้านค่ะ"
- ลิสต์สินค้าที่มี ต้องมีอยู่จริงในระบบ ห้ามคิดชื่อสินค้าสุ่มสี่สุ่มห้า หรือสุ่มราคาขึ้นมาเองโดยเด็ดขาด!
- ถ้าลูกค้าถามเรื่องสินค้าหรือหมวดหมู่ ต้องเรียก tool ก่อน ห้ามตอบเองโดยเด็ดขาด

## Tools ที่มี:
${toolDescriptions}

## วิธีเรียก tool (บังคับใช้รูปแบบนี้เท่านั้น):
[TOOL_CALL] {"name":"tool_name","arguments":{"key":"value"}} [/TOOL_CALL]

## ตัวอย่างที่ถูกต้อง (MUST follow these patterns):

ลูกค้า: "มีหมวดหมู่อะไรบ้าง"
[TOOL_CALL] {"name":"get_categories","arguments":{}} [/TOOL_CALL]

ลูกค้า: "ดูหมวดหมู่สินค้า"
[TOOL_CALL] {"name":"get_categories","arguments":{}} [/TOOL_CALL]

ลูกค้า: "อยากได้เครื่องดื่ม"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"เครื่องดื่ม"}} [/TOOL_CALL]

ลูกค้า: "เครื่องดื่ม"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"เครื่องดื่ม"}} [/TOOL_CALL]

ลูกค้า: "ขนมขบเคี้ยว"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"ขนมขบเคี้ยว"}} [/TOOL_CALL]

ลูกค้า: "ของใช้ส่วนตัว"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"ของใช้ส่วนตัว"}} [/TOOL_CALL]

ลูกค้า: "ผลิตภัณฑ์ทำความสะอาด"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"ผลิตภัณฑ์ทำความสะอาด"}} [/TOOL_CALL]

ลูกค้า: "ยาสามัญประจำบ้าน"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"ยาสามัญประจำบ้าน"}} [/TOOL_CALL]

ลูกค้า: "สินค้าเบ็ดเตล็ด"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"สินค้าเบ็ดเตล็ด"}} [/TOOL_CALL]

ลูกค้า: "ของสดและอื่นๆ"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"ของสดและอื่นๆ"}} [/TOOL_CALL]

ลูกค้า: "อาหารแห้งและเครื่องปรุง"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"อาหารแห้งและเครื่องปรุง"}} [/TOOL_CALL]

ลูกค้า: "สินค้าหมวดอาหาร"
[TOOL_CALL] {"name":"get_products_by_category","arguments":{"category_name":"อาหารแห้งและเครื่องปรุง"}} [/TOOL_CALL]

ลูกค้า: "มีน้ำดื่มไหม"
[TOOL_CALL] {"name":"search_products","arguments":{"query":"น้ำดื่ม"}} [/TOOL_CALL]

ลูกค้า: "เพิ่มไข่ไก่ 2 แผงลงตะกร้า"
[TOOL_CALL] {"name":"add_product_to_cart","arguments":{"product_name":"ไข่ไก่","quantity":2}} [/TOOL_CALL]

ลูกค้า: "ซื้อน้ำปลา 1 ขวด"
[TOOL_CALL] {"name":"add_product_to_cart","arguments":{"product_name":"น้ำปลา","quantity":1}} [/TOOL_CALL]

ลูกค้า: "ใส่โค้ก 3 กระป๋องลงตะกร้า"
[TOOL_CALL] {"name":"add_product_to_cart","arguments":{"product_name":"โค้ก","quantity":3}} [/TOOL_CALL]

ลูกค้า: "ดูออเดอร์ของฉัน"
[TOOL_CALL] {"name":"get_my_orders","arguments":{}} [/TOOL_CALL]

ลูกค้า: "ชำระเงิน"
[TOOL_CALL] {"name":"get_my_addresses","arguments":{}} [/TOOL_CALL]

ลูกค้า: "สั่งซื้อเลย"
[TOOL_CALL] {"name":"get_my_addresses","arguments":{}} [/TOOL_CALL]

ลูกค้า: "จ่ายเงินเลย"
[TOOL_CALL] {"name":"get_my_addresses","arguments":{}} [/TOOL_CALL]

ลูกค้า: "อัพเดทโค้กเป็น 5 กระป๋อง"
[TOOL_CALL] {"name":"update_cart_quantity","arguments":{"product_name":"โค้ก","quantity":5}} [/TOOL_CALL]

ลูกค้า: "เอาไข่ไก่ออก"
[TOOL_CALL] {"name":"remove_from_cart","arguments":{"product_name":"ไข่ไก่"}} [/TOOL_CALL]

ลูกค้า: "ส่งไปที่อยู่เดิม จ่ายปลายทาง" (สมมติแชทบอทรู้ที่อยู่แล้ว)
[TOOL_CALL] {"name":"checkout_order_in_chatbot","arguments":{"address_id":1,"payment_method":"cod"}} [/TOOL_CALL]

ลูกค้า: "สแกนจ่าย"
[TOOL_CALL] {"name":"checkout_order_in_chatbot","arguments":{"address_id":1,"payment_method":"promptpay"}} [/TOOL_CALL]

## กฎสำคัญ:
- ถ้าลูกค้าถามหมวดหมู่ → เรียก get_categories เสมอ
- ถ้าลูกค้าพิมพ์ชื่อหมวดหมู่ (เช่น "เครื่องดื่ม" "ขนมขบเคี้ยว" "สินค้าเบ็ดเตล็ด" ฯลฯ) → เรียก get_products_by_category ทันที ห้ามเรียก search_products
- ถ้าลูกค้าค้นหาสินค้าด้วยชื่อสินค้า → เรียก search_products
## กฎการแสดงผล (FORMATTING):
- แสดงรายการสินค้าด้วย "•" หรือ "-" นำหน้า ห้ามใช้ emoji 🚨 หรือ emoji ที่ไม่เกี่ยวข้องกับสินค้า
- ใช้ emoji จากหมวดหมู่เท่านั้น: 🥤เครื่องดื่ม, 🌾อาหารแห้ง, 🍿ขนม, 🧴ของใช้, 🧹ทำความสะอาด, 💊ยา, 🛍️เบ็ดเตล็ด, 🥬ของสด
- ถ้าลูกค้าพูดว่า "เพิ่ม" "ซื้อ" "ใส่" + ชื่อสินค้า → เรียก add_product_to_cart ทันที โดยใส่ชื่อสินค้าตรงๆ ตามที่ลูกค้าพูด
- ถ้าต้องการเพิ่ม/ลด/อัพเดทจำนวนตะกร้า ให้เรียก tool ที่เกี่ยวข้องเสมอ ห้ามตอบปากเปล่า
- ถ้าลูกค้าพูดว่า "ชำระเงิน" "สั่งซื้อ" "จ่ายเงิน" → เรียก get_my_addresses ทันที เพื่อนำที่อยู่มาให้ลูกค้าเลือก
- ถามยืนยันที่อยู่และวิธีชำระเงินเสมอ (ปลายทาง หรือ สแกนจ่าย)
- เมื่อลูกค้าตอบวิธีชำระเงินและเลือกที่อยู่แล้ว ให้เรียก \`checkout_order_in_chatbot\`
- ถ้า Tool ส่งออเดอร์ status = 'cancelled' กลับมาและมี cancel_note ให้แจ้งหมายเหตุการยกเลิกนั้นด้วยเสมอ เช่น "เหตุผลที่ยกเลิก: [cancel_note]"
- ห้ามตอบ raw JSON ให้ลูกค้า
- ห้ามอ้างว่า "ระบบปรับปรุง" หรือ "ไม่สามารถดูได้ตอนนี้" — ให้เรียก tool ได้เลย`;

    if (customer?.name) {
        prompt += `\n\nลูกค้าที่กำลังคุยด้วยคือ: ${customer.name} (เบอร์ ${customer.phone})`;
    } else {
        prompt += `\n\nลูกค้ายังไม่ได้ล็อกอิน (ออเดอร์และที่จัดส่งจะไม่สามารถใช้ได้)`;
    }

    if (cartItems && cartItems.length > 0) {
        prompt += `\n\n**สถานะตะกร้าสินค้าปัจจุบันของลูกค้า:**\n`;
        cartItems.forEach(item => {
            prompt += `- ${item.product_name} x ${item.quantity} (ราคาต่อชิ้น: ${item.price})\n`;
        });
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        prompt += `**ยอดรวมทั้งสิ้น:** ${total} บาท\n`;
    } else {
        prompt += `\n\n**สถานะตะกร้าสินค้าปัจจุบัน:** ว่างเปล่า`;
    }

    return prompt;
};

module.exports = { chatWithTools, buildSystemPrompt, TOOLS };
