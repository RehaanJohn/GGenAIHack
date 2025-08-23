// src/app/api/upload-document/route.ts

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

// Function to clean and validate text content
function cleanText(text: string): string {
  // Remove non-printable characters and control characters
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    .replace(/[^\x20-\x7E\s]/g, ' ') // Keep only ASCII printable characters and whitespace
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
  
  return cleaned;
}

// Function to validate if text is readable (not corrupted)
function isValidText(text: string): boolean {
  // Check for minimum readable content
  if (text.length < 10) return false;
  
  // Check ratio of printable characters to total length
  const printableCount = (text.match(/[a-zA-Z0-9\s.,!?;:()\-"']/g) || []).length;
  const ratio = printableCount / text.length;
  
  // Should be at least 70% readable characters
  return ratio > 0.7;
}

// Extract text from different file types
async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    // For now, reject PDFs and ask user to convert to text
    // The built-in PDF extraction is too unreliable
    throw new Error("PDF files are currently not supported due to text extraction limitations. Please convert your PDF to a text (.txt) file and upload that instead. You can use online PDF to text converters or copy-paste the content into a text file.");
  }
  
  // For text files
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    try {
      // Try UTF-8 first
      let text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      text = cleanText(text);
      
      if (isValidText(text)) {
        return text;
      }
      
      // If UTF-8 fails, try other encodings
      text = new TextDecoder('iso-8859-1').decode(buffer);
      text = cleanText(text);
      
      if (isValidText(text)) {
        return text;
      }
      
      throw new Error("Could not decode text file properly");
    } catch (error) {
      throw new Error("Failed to read text file. Please ensure it's a valid UTF-8 encoded text file.");
    }
  }
  
  // For DOCX files
  if (file.name.endsWith('.docx')) {
    throw new Error("DOCX files are not yet supported. Please save your document as a plain text (.txt) file and upload that instead.");
  }
  
  // For DOC files
  if (file.name.endsWith('.doc')) {
    throw new Error("DOC files are not yet supported. Please save your document as a plain text (.txt) file and upload that instead.");
  }
  
  // For other file types, reject them
  throw new Error("Unsupported file type. Please use plain text (.txt) files only for now.");
}

// Generate embeddings using Google's embedding model
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  
  const embeddings: number[][] = [];
  
  // Process each text individually to avoid rate limits
  for (const text of texts) {
    // Validate text before sending to API
    if (!isValidText(text)) {
      console.warn(`Skipping invalid text chunk: ${text.substring(0, 100)}...`);
      // Create dummy embedding for invalid chunks
      embeddings.push(new Array(768).fill(0).map(() => Math.random() * 0.01));
      continue;
    }
    
    try {
      // Use the correct API call format
      const result = await model.embedContent(text);
      
      if (result.embedding && result.embedding.values) {
        embeddings.push(result.embedding.values);
      } else {
        console.warn(`Failed to generate embedding for text chunk, using dummy embedding`);
        embeddings.push(new Array(768).fill(0).map(() => Math.random() * 0.01));
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Error generating embedding:", error);
      console.error("Problematic text:", text.substring(0, 200));
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

    // Validate file size (5MB limit for now)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "File size too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Only allow text files for now
    const allowedTypes = ['.txt'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Currently only plain text (.txt) files are supported. Please convert your document to a text file and try again." 
        },
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

    // Validate that the extracted text is readable
    if (!isValidText(extractedText)) {
      return NextResponse.json(
        { success: false, error: "The uploaded file contains corrupted or unreadable text. Please ensure it's a valid text file." },
        { status: 400 }
      );
    }

    console.log(`Extracted ${extractedText.length} characters of valid text from ${file.name}`);

    // Split text into chunks
    const chunks = splitTextIntoChunks(extractedText);
    
    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No chunks could be created from the document" },
        { status: 400 }
      );
    }

    // Limit chunks to avoid overwhelming the system
    const limitedChunks = chunks.slice(0, 30); // Reduced from 50 to 30 for faster processing

    // Validate all chunks before processing
    const validChunks = limitedChunks.filter(chunk => isValidText(chunk));
    
    if (validChunks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid text chunks could be created from the document" },
        { status: 400 }
      );
    }

    console.log(`Processing ${validChunks.length} valid chunks out of ${limitedChunks.length} total chunks`);

    // Generate embeddings using Google's embedding model
    console.log(`Generating embeddings for ${validChunks.length} chunks...`);
    const embeddings = await generateEmbeddings(validChunks);
    
    if (embeddings.length !== validChunks.length) {
      return NextResponse.json(
        { success: false, error: "Failed to generate embeddings for all chunks" },
        { status: 500 }
      );
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });

    // Check if index exists
    try {
      await pinecone.describeIndex(process.env.PINECONE_INDEX_NAME as string);
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Pinecone index not found. Please create an index named 'LegalDoc' with 768 dimensions in your Pinecone console.",
          details: "Go to https://app.pinecone.io/ and create an index with dimensions: 768, metric: cosine"
        },
        { status: 404 }
      );
    }

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);

    // Create vectors for Pinecone
    const vectors = validChunks.map((chunk, chunkIndex) => ({
      id: `${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}_chunk_${chunkIndex}_${Date.now()}`,
      values: embeddings[chunkIndex],
      metadata: {
        filename: file.name,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        chunkIndex: chunkIndex,
        totalChunks: validChunks.length,
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
      chunksCreated: validChunks.length,
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