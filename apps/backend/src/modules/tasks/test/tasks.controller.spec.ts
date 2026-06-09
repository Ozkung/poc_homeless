import { Test } from '@nestjs/testing';
import { TasksController } from '../tasks.controller';
import { TasksService } from '../tasks.service';
import { SubmissionsService } from '../../submissions/submissions.service';

const mockTasksService = {
  findMyTasks: jest.fn(), checkin: jest.fn(), addNote: jest.fn(),
  updateStatus: jest.fn(), generateLiffToken: jest.fn(), consumeLiffToken: jest.fn(),
};
const mockSubmissionsService = {
  create: jest.fn().mockResolvedValue({ id: 'sub1' }),
};
const mockUser = { sub: 'u1', email: 'a@b.com', role: 'CARE_GIVER', orgId: 'o1' };

describe('TasksController POST /:id/submit', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: SubmissionsService, useValue: mockSubmissionsService },
      ],
    }).compile();
    controller = module.get(TasksController);
    jest.clearAllMocks();
  });

  it('submit delegates to SubmissionsService.create', async () => {
    const dto = { token: 'tok', answers: [{ fieldId: 'f1', value: 'yes' }] };
    const result = await controller.submit('task1', dto, mockUser as any);
    expect(mockSubmissionsService.create).toHaveBeenCalledWith('u1', {
      taskId: 'task1', token: 'tok', answers: dto.answers,
    });
    expect(result).toEqual({ id: 'sub1' });
  });
});
