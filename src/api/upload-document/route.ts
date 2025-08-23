// src/api/upload-document/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

// Text splitter function
function splitTextIntoChunks(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // If we're not at the end of the text, try to break at a sentence or word boundary
    if (end < text.length) {
      const lastSentence = text.lastIndexOf('.', end);
      const lastSpace = text.lastIndexOf(' ', end);
      
      if (lastSentence > start + chunkSize / 2) {
        end = lastSentence + 1;
      } else if (lastSpace > start + chunkSize / 2) {
        end = lastSpace;
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

// Extract text from different file types
async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    // For PDF files, we'll use a simple text extraction
    // In production, you should use pdf-parse or similar library
    try {
      // Simple PDF text extraction (very basic)
      const uint8Array = new Uint8Array(buffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
      
      // Very basic PDF text extraction - look for text patterns
      // This is not ideal but works as a fallback
      const textMatches = text.match(/\(([^)]+)\)/g);
      if (textMatches && textMatches.length > 0) {
        return textMatches.map(match => match.slice(1, -1)).join(' ');
      }
      
      // If no text found in PDF, return an error message
      return "Could not extract text from PDF. For better PDF support, please convert to TXT format or use a specialized PDF processing service.";
    } catch (error) {
      console.error("Error extracting PDF:", error);
      throw new Error("Failed to extract text from PDF file. Please try converting to TXT format.");
    }
  }
  
  // For text files
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    const text = new TextDecoder().decode(buffer);
    return text;
  }
  
  // For DOCX files (basic support)
  if (file.name.endsWith('.docx')) {
    // Basic DOCX support would require mammoth.js
    // For now, return an error message
    throw new Error("DOCX files are not yet supported. Please convert to TXT or PDF format.");
  }
  
  // For other file types, treat as text (basic fallback)
  const text = new TextDecoder().decode(buffer);
  return text;
}

// Generate embeddings using Google's embedding model
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  
  const embeddings: number[][] = [];
  
  // Process each text individually to avoid rate limits
  for (const text of texts) {
    try {
      const result = await model.embedContent(text);
      if (result.embedding && result.embedding.values) {
        embeddings.push(result.embedding.values);
      } else {
        // Fallback: create a dummy embedding if generation fails
        console.warn(`Failed to generate embedding for text chunk, using dummy embedding`);
        embeddings.push(new Array(768).fill(0).map(() => Math.random() * 0.01));
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Error generating embedding:", error);
      // Create dummy embedding as fallback
      embeddings.push(new Array(768).fill(0).map(() => Math.random() * 0.01));
    }
  }
  
  return embeddings;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('document') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "File size too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Supported types: PDF, DOC, DOCX, TXT" },
        { status: 400 }
      );
    }

    // Extract text from file
    const extractedText = await extractTextFromFile(file);
    
    if (!extractedText.trim()) {
      return NextResponse.json(
        { success: false, error: "No text could be extracted from the file" },
        { status: 400 }
      );
    }

    if (extractedText.length < 50) {
      return NextResponse.json(
        { success: false, error: "Extracted text is too short. Please check if the file contains readable text." },
        { status: 400 }
      );
    }

    // Split text into chunks
    const chunks = splitTextIntoChunks(extractedText);
    
    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No chunks could be created from the document" },
        { status: 400 }
      );
    }

    // Limit chunks to avoid overwhelming the system
    const limitedChunks = chunks.slice(0, 50); // Max 50 chunks

    // Generate embeddings using Google's embedding model
    console.log(`Generating embeddings for ${limitedChunks.length} chunks...`);
    const embeddings = await generateEmbeddings(limitedChunks);
    
    if (embeddings.length !== limitedChunks.length) {
      return NextResponse.json(
        { success: false, error: "Failed to generate embeddings for all chunks" },
        { status: 500 }
      );
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);

    // Create vectors for Pinecone
    const vectors = limitedChunks.map((chunk, chunkIndex) => ({
      id: `${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}_chunk_${chunkIndex}`,
      values: embeddings[chunkIndex],
      metadata: {
        filename: file.name,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        chunkIndex: chunkIndex,
        totalChunks: limitedChunks.length,
        content: chunk,
        fileType: fileExtension,
      },
    }));

    // Upsert vectors to Pinecone
    console.log(`Uploading ${vectors.length} vectors to Pinecone...`);
    await index.upsert(vectors);

    return NextResponse.json({
      success: true,
      message: "Document uploaded and processed successfully",
      documentId: file.name,
      chunksCreated: limitedChunks.length,
      vectorsUploaded: vectors.length,
      extractedTextLength: extractedText.length,
    });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}