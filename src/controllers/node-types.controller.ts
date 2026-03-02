import { Request, Response, NextFunction } from 'express';
import { NodeType, MESSAGING_NODE_TYPES, LOGIC_NODE_TYPES, FLOW_CONTROL_NODE_TYPES, INTEGRATION_NODE_TYPES } from '../schemas/node-types.enum';

export class NodeTypesController {
  getNodeTypes = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const nodeTypes = Object.values(NodeType).map(type => ({
        type,
        category: this.getCategory(type),
      }));

      res.json({
        nodeTypes,
        categories: {
          messaging: MESSAGING_NODE_TYPES,
          logic: LOGIC_NODE_TYPES,
          flow_control: FLOW_CONTROL_NODE_TYPES,
          integration: INTEGRATION_NODE_TYPES,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  private getCategory(type: NodeType): string {
    if (MESSAGING_NODE_TYPES.includes(type)) return 'messaging';
    if (LOGIC_NODE_TYPES.includes(type)) return 'logic';
    if (FLOW_CONTROL_NODE_TYPES.includes(type)) return 'flow_control';
    if (INTEGRATION_NODE_TYPES.includes(type)) return 'integration';
    return 'unknown';
  }
}
