/**
 * Query Routes
 * Query execution endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { QueryRequest, ExecuteRequest, ApiResponse, HttpQueryResult, InsertExceptionDataRequest, InsertExceptionDataResponse } from '../../types/http.js';
import type { QueryResult } from '../../types/adapter.js';
import { ConnectionManager } from '../../core/connection-manager.js';

export async function setupQueryRoutes(
  fastify: FastifyInstance,
  connectionManager: ConnectionManager
): Promise<void> {
  /**
   * POST /api/query
   * Execute a query (read operations)
   */
  fastify.post<{
    Body: QueryRequest;
    Reply: ApiResponse<HttpQueryResult>;
  }>('/api/query', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'query'],
        properties: {
          sessionId: { type: 'string' },
          query: { type: 'string' },
          params: { type: 'array' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, query, params } = request.body;

      // Get database service
      const service = connectionManager.getService(sessionId);

      // Execute query
      const result = await service.executeQuery(query, params);

      // Convert rows to JSON string for Coze compatibility
      const httpResult: HttpQueryResult = {
        rows: JSON.stringify(result.rows),
        affectedRows: result.affectedRows,
        executionTime: result.executionTime,
        metadata: result.metadata,
      };

      return {
        success: true,
        data: httpResult,
        metadata: {
          executionTime: result.executionTime,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: error instanceof Error ? error.message : 'Failed to execute query',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * POST /api/execute
   * Execute a write operation (INSERT, UPDATE, DELETE, etc.)
   */
  fastify.post<{
    Body: ExecuteRequest;
    Reply: ApiResponse<QueryResult>;
  }>('/api/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'query'],
        properties: {
          sessionId: { type: 'string' },
          query: { type: 'string' },
          params: { type: 'array' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, query, params } = request.body;

      // Get database service
      const service = connectionManager.getService(sessionId);

      // Execute query (validation happens in service)
      const result = await service.executeQuery(query, params);

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: result.executionTime,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'EXECUTE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to execute operation',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * POST /api/insert-exception-data
   * Insert exception data into configured error table and tl table
   */
  fastify.post<{
    Body: InsertExceptionDataRequest;
    Reply: ApiResponse<InsertExceptionDataResponse>;
  }>('/api/insert-exception-data', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'data'],
        properties: {
          sessionId: { type: 'string' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              required: ['MESSAGE_CODE', 'MESSAGE'],
              properties: {
                MESSAGE_CODE: { type: 'string' },
                MESSAGE: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, data } = request.body;

      const service = connectionManager.getService(sessionId);
      const result = await service.insertExceptionData(data);

      return {
        success: true,
        data: {
          affectedRows: result.affectedRows,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'INSERT_EXCEPTION_DATA_FAILED',
          message: error instanceof Error ? error.message : 'Failed to insert exception data',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });
}
