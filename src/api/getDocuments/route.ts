// app/api/getDocuments/route.ts

import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

export async function GET() {
  try {
    // Initialize the Pinecone client
    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);

    // Query to get all documents with their metadata
    // We'll use a dummy query to get all vectors
    const queryResponse = await pineconeIndex.query({
      vector: new Array(1536).fill(0), // OpenAI embeddings are 1536 dimensions
      topK: 10000, // Large number to get all documents
      includeMetadata: true,
    });

    // Extract unique documents based on filename
    const documentsMap = new Map();
    
    queryResponse.matches?.forEach((match) => {
      const metadata = match.metadata;
      if (metadata?.filename || metadata?.source) {
        const filename = metadata.filename || metadata.source;
        
        if (!documentsMap.has(filename)) {
          documentsMap.set(filename, {
            name: filename,
            size: metadata.fileSize || 0,
            // uploadedAt: metadata.uploadDate ? new Date(metadata.uploadDate) : new Date(),
            totalChunks: metadata.totalChunks || 0,
          });
        }
      }
    });

    const documents = Array.from(documentsMap.values());

    return NextResponse.json({ 
      success: true, 
      documents: documents.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )
    });

  } catch (error) {
    console.error("Failed to fetch documents:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch documents", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}