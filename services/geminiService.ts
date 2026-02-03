import { GoogleGenAI } from "@google/genai";
import { SerialUnit, PartNumber } from "../types";

// Initialize Gemini API with the environment API key
// Use 'gemini-3-flash-preview' for basic text tasks and 'gemini-3-pro-preview' for complex reasoning.

/**
 * Generates a technical description for a manufacturing part using Gemini.
 */
export const generatePartDescription = async (partNumber: string, productCode: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a concise, professional technical description for a manufacturing part used in Li-Ion battery assembly. 
      Part Number: ${partNumber}
      Product Code: ${productCode}
      The description should highlight potential industrial applications. Keep it under 60 words.`,
    });
    
    // Extracting text output directly from the response object property
    return (response.text || "").trim() || "No description generated.";
  } catch (error) {
    console.error("Gemini Error [generatePartDescription]:", error);
    return "Error generating description via AI.";
  }
};

/**
 * Analyzes production logs to identify bottlenecks or anomalies using Gemini Pro.
 * Ahora siempre retorna un objeto { text: string } para máxima compatibilidad frontend.
 */
export const analyzeProductionLog = async (serials: SerialUnit[], parts: PartNumber[]): Promise<{ text: string }> => {
  try {
    // Limit data to prevent token overflow while maintaining representative sample
    const sampleSerials = serials.slice(0, 30);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are a production engineering expert. Analyze the following manufacturing data for a Li-Ion line.
      Identify:
      1. Potential bottlenecks in the process flow.
      2. Anomalies in history timestamps.
      3. Overall line efficiency insights.

      Production Data (Sample):
      ${JSON.stringify(sampleSerials)}

      Parts Context:
      ${JSON.stringify(parts)}

      Provide a high-level summary with actionable insights for the floor supervisor.`,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });

    // Siempre retorna un objeto { text: string }
    return { text: (response.text || '').trim() || 'AI could not provide an analysis at this time.' };
  } catch (error) {
    console.error("Gemini Error [analyzeProductionLog]:", error);
    return { text: "Error performing AI production analysis." };
  }
};
