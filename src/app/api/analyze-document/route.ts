// src/app/api/analyze-document/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

// Analysis prompts for different types
const analysisPrompts = {
  summarize: `You are a legal document analyzer. Provide a clear, concise summary of this legal document in plain English. Focus on:
- What type of document this is
- Main parties involved
- Key obligations and rights
- Important dates or deadlines
- Overall purpose and scope

Keep the summary accessible to non-lawyers.`,

  detailed: `You are a legal expert providing detailed analysis. Analyze this legal document comprehensively, covering:
- Document structure and sections
- Legal implications of each major clause
- Rights and obligations of all parties
- Potential consequences and enforcement mechanisms
- Important legal terminology explanations
- Risk factors and protections

Provide thorough but understandable explanations.`,

  risks: `You are a legal risk analyst. Identify and explain potential risks and red flags in this legal document:
- Financial risks and liabilities
- Legal vulnerabilities
- Unfavorable terms or clauses
- Potential disputes or conflicts
- Missing protections or safeguards
- Recommendations for risk mitigation

Rate each risk as HIGH, MEDIUM, or LOW and explain why.`,

  "key-terms": `You are a legal document interpreter. Extract and explain the most important terms and clauses:
- Define complex legal terminology
- Explain key obligations and rights
- Highlight critical deadlines and conditions
- Identify penalty or consequence clauses
- Point out any unusual or non-standard terms

Make technical language accessible to general audiences.`,

  "plain-english": `You are a legal translator. Convert the complex legal language in this document into plain English:
- Replace legal jargon with everyday language
- Simplify complex sentence structures
- Explain what each section actually means in practice
- Use analogies or examples where helpful
- Maintain the essential legal meaning while making it understandable

Focus on clarity and accessibility.`
};

export async function POST(request: NextRequest) {
  try {
    const { analysisType, fileName } = await request.json();

    if (!analysisType || !fileName) {
      return NextResponse.json(
        { success: false, error: "Missing analysis type or file name" },
        { status: 400 }
      );
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);

    // Create a query embedding using Google's embedding model
    const queryText = `${analysisType} analysis of ${fileName}`;
    
    let queryEmbedding: number[];
    try {
      const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await embeddingModel.embedContent(queryText);
      
      if (result.embedding && result.embedding.values) {
        queryEmbedding = result.embedding.values;
      } else {
        throw new Error("Failed to generate query embedding");
      }
    } catch (error) {
      console.error("Error generating query embedding:", error);
      // Fallback: use dummy embedding
      queryEmbedding = new Array(768).fill(0).map(() => Math.random() * 0.01);
    }

    // Query Pinecone for relevant document chunks
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: 20, // Get more chunks for comprehensive analysis
      includeMetadata: true,
      filter: {
        filename: { $eq: fileName }
      }
    });

    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return NextResponse.json(
        { success: false, error: "Document not found in database" },
        { status: 404 }
      );
    }

    // Combine relevant chunks
    const relevantContent = queryResponse.matches
      .map(match => match.metadata?.content)
      .filter(content => content)
      .join('\n\n');

    if (!relevantContent) {
      return NextResponse.json(
        { success: false, error: "No content found for analysis" },
        { status: 404 }
      );
    }

    // Get the appropriate prompt
    const systemPrompt = analysisPrompts[analysisType as keyof typeof analysisPrompts] 
      || analysisPrompts.summarize;

    // Use Gemini 1.5 Flash for analysis (current model)
    try {
      // Try Gemini 1.5 Flash first (most common and available)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          maxOutputTokens: 4000,
          temperature: 0.1,
        }
      });
      
      const prompt = `${systemPrompt}\n\nDocument Content:\n${relevantContent}`;
      
      const result = await model.generateContent(prompt);
      const analysis = result.response.text();

      return NextResponse.json({
        success: true,
        analysis: analysis,
        analysisType: analysisType,
        fileName: fileName,
        chunksAnalyzed: queryResponse.matches.length,
      });

    } catch (modelError) {
      console.error("Gemini 1.5 Flash error, trying fallback:", modelError);
      
      try {
        // Fallback to Gemini 1.5 Pro
        const fallbackModel = genAI.getGenerativeModel({ 
          model: "gemini-1.5-pro",
          generationConfig: {
            maxOutputTokens: 4000,
            temperature: 0.1,
          }
        });
        
        const prompt = `${systemPrompt}\n\nDocument Content:\n${relevantContent}`;
        const result = await fallbackModel.generateContent(prompt);
        const analysis = result.response.text();

        return NextResponse.json({
          success: true,
          analysis: analysis,
          analysisType: analysisType,
          fileName: fileName,
          chunksAnalyzed: queryResponse.matches.length,
          note: "Used fallback model due to primary model unavailability"
        });

      } catch (fallbackError) {
        console.error("All Gemini models failed:", fallbackError);
        
        // Return a basic analysis if AI models fail
        return NextResponse.json({
          success: true,
          analysis: `Document Analysis for ${fileName}
          
Analysis Type: ${formatAnalysisType(analysisType)}

Content Summary:
The document contains ${queryResponse.matches.length} sections of content. 

Key Content Preview:
${relevantContent.substring(0, 500)}...

Note: AI analysis is currently unavailable. This is a basic content extraction. Please try again later for full AI-powered analysis.`,
          analysisType: analysisType,
          fileName: fileName,
          chunksAnalyzed: queryResponse.matches.length,
          warning: "AI analysis unavailable - showing basic content extraction"
        });
      }
    }

  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to format analysis type names
function formatAnalysisType(type: string): string {
  switch (type) {
    case "summarize":
      return "Document Summary";
    case "detailed":
      return "Detailed Analysis";
    case "risks":
      return "Risk Assessment";
    case "key-terms":
      return "Key Terms & Clauses";
    case "plain-english":
      return "Plain English Translation";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}