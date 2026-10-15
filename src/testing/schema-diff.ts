import type { OpenAPISpec, NormalizedOperation } from '../types/openapi.js';
import { OpenAPILoader } from '../compiler/openapi-loader.js';

export interface DiffChange {
  severity: 'breaking' | 'warning' | 'info';
  operationId: string;
  path: string;
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface SchemaDiffResult {
  hasBreakingChanges: boolean;
  breakingCount: number;
  warningCount: number;
  infoCount: number;
  changes: DiffChange[];
}

export class SchemaDiff {
  /**
   * Compares two OpenAPI specifications and flags LLM tool-calling regressions & breaking changes
   */
  static compare(oldSpecInput: string | OpenAPISpec, newSpecInput: string | OpenAPISpec): SchemaDiffResult {
    const oldSpec = typeof oldSpecInput === 'string' ? OpenAPILoader.load(oldSpecInput) : oldSpecInput;
    const newSpec = typeof newSpecInput === 'string' ? OpenAPILoader.load(newSpecInput) : newSpecInput;

    const oldOps = OpenAPILoader.extractOperations(oldSpec);
    const newOps = OpenAPILoader.extractOperations(newSpec);

    const changes: DiffChange[] = [];

    // 1. Check for removed operations (Breaking)
    for (const oldOp of oldOps) {
      const matchedNewOp = newOps.find(n => n.id === oldOp.id || (n.path === oldOp.path && n.method === oldOp.method));
      if (!matchedNewOp) {
        changes.push({
          severity: 'breaking',
          operationId: oldOp.id,
          path: `${oldOp.method.toUpperCase()} ${oldOp.path}`,
          message: `Operation was removed or renamed. Models calling this tool will fail.`
        });
      }
    }

    // 2. Check for newly added operations (Info)
    for (const newOp of newOps) {
      const matchedOldOp = oldOps.find(o => o.id === newOp.id || (o.path === newOp.path && o.method === newOp.method));
      if (!matchedOldOp) {
        changes.push({
          severity: 'info',
          operationId: newOp.id,
          path: `${newOp.method.toUpperCase()} ${newOp.path}`,
          message: `New operation added.`
        });
      }
    }

    // 3. Check for parameter and body changes in matching operations
    for (const oldOp of oldOps) {
      const newOp = newOps.find(n => n.id === oldOp.id || (n.path === oldOp.path && n.method === oldOp.method));
      if (!newOp) continue;

      this.compareParameters(oldOp, newOp, changes);
      this.compareRequestBody(oldOp, newOp, changes);
    }

    const breakingCount = changes.filter(c => c.severity === 'breaking').length;
    const warningCount = changes.filter(c => c.severity === 'warning').length;
    const infoCount = changes.filter(c => c.severity === 'info').length;

    return {
      hasBreakingChanges: breakingCount > 0,
      breakingCount,
      warningCount,
      infoCount,
      changes
    };
  }

  private static compareParameters(oldOp: NormalizedOperation, newOp: NormalizedOperation, changes: DiffChange[]) {
    // Check for newly added required parameters (Breaking)
    for (const newP of newOp.parameters) {
      const oldP = oldOp.parameters.find(p => p.name === newP.name);
      if (!oldP && newP.required) {
        changes.push({
          severity: 'breaking',
          operationId: newOp.id,
          path: `parameters.${newP.name}`,
          message: `New required parameter "${newP.name}" added. Existing agent calls without this parameter will fail.`
        });
      } else if (!oldP) {
        changes.push({
          severity: 'info',
          operationId: newOp.id,
          path: `parameters.${newP.name}`,
          message: `New optional parameter "${newP.name}" added.`
        });
      }
    }

    // Check for changed existing parameters
    for (const oldP of oldOp.parameters) {
      const newP = newOp.parameters.find(p => p.name === oldP.name);
      if (!newP) {
        changes.push({
          severity: 'warning',
          operationId: oldOp.id,
          path: `parameters.${oldP.name}`,
          message: `Parameter "${oldP.name}" was removed.`
        });
        continue;
      }

      // Check parameter made required
      if (!oldP.required && newP.required) {
        changes.push({
          severity: 'breaking',
          operationId: oldOp.id,
          path: `parameters.${oldP.name}.required`,
          message: `Optional parameter "${oldP.name}" was changed to required.`
        });
      }

      // Check parameter type change
      const oldType = oldP.schema?.type || 'string';
      const newType = newP.schema?.type || 'string';
      if (oldType !== newType) {
        changes.push({
          severity: 'breaking',
          operationId: oldOp.id,
          path: `parameters.${oldP.name}.type`,
          message: `Parameter type changed from "${oldType}" to "${newType}".`,
          oldValue: oldType,
          newValue: newType
        });
      }

      // Check removed enum values
      if (oldP.schema?.enum && newP.schema?.enum) {
        const removedEnums = oldP.schema.enum.filter(e => !newP.schema!.enum!.includes(e));
        if (removedEnums.length > 0) {
          changes.push({
            severity: 'breaking',
            operationId: oldOp.id,
            path: `parameters.${oldP.name}.enum`,
            message: `Allowed enum values removed: [${removedEnums.join(', ')}]. Agents selecting these values will be rejected.`,
            oldValue: oldP.schema.enum,
            newValue: newP.schema.enum
          });
        }
      }
    }
  }

  private static compareRequestBody(oldOp: NormalizedOperation, newOp: NormalizedOperation, changes: DiffChange[]) {
    if (!oldOp.requestBodySchema && newOp.requestBodySchema && newOp.requestBodyRequired) {
      changes.push({
        severity: 'breaking',
        operationId: newOp.id,
        path: 'requestBody',
        message: 'Required request body added where none was previously expected.'
      });
      return;
    }

    if (oldOp.requestBodySchema?.properties && newOp.requestBodySchema?.properties) {
      const oldReq = oldOp.requestBodySchema.required || [];
      const newReq = newOp.requestBodySchema.required || [];

      for (const [propName, propSchema] of Object.entries(newOp.requestBodySchema.properties)) {
        const wasInOld = oldOp.requestBodySchema.properties[propName];
        if (!wasInOld && newReq.includes(propName)) {
          changes.push({
            severity: 'breaking',
            operationId: newOp.id,
            path: `requestBody.properties.${propName}`,
            message: `New required property "${propName}" added to request body.`
          });
        }
      }
    }
  }
}
