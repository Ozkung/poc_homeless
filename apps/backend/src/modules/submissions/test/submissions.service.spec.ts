import { Test } from '@nestjs/testing';
import { GoneException, BadRequestException } from '@nestjs/common';
import { SubmissionsService } from '../submissions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';

const mockPrisma = {
  submission: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

const mockTasksService = {
  findOne: jest.fn(),
  consumeLiffToken: jest.fn(),
};

const mockCrypto = {
  encrypt: jest.fn((v: string) => `enc(${v})`),
  decrypt: jest.fn((v: string) => v.replace(/^enc\(|\)$/g, '')),
};

describe('SubmissionsService', () => {
  let service: SubmissionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: AesGcmService, useValue: mockCrypto },
      ],
    }).compile();

    service = module.get(SubmissionsService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const validTask = {
      id: 'task1',
      patientId: 'patient1',
      formTemplateId: 'form1',
      assigneeId: 'user1',
    };

    const submissionData = {
      taskId: 'task1',
      token: 'valid-token',
      answers: [{ fieldId: 'f1', value: 'answer' }],
    };

    it('creates a submission with correct fields when token is valid', async () => {
      mockTasksService.findOne.mockResolvedValue(validTask);
      mockTasksService.consumeLiffToken.mockResolvedValue(true);
      const createdSubmission = {
        id: 'sub1',
        taskId: 'task1',
        patientId: 'patient1',
        formTemplateId: 'form1',
        submittedById: 'user1',
        answers: submissionData.answers,
      };
      mockPrisma.submission.create.mockResolvedValue(createdSubmission);

      const result = await service.create('user1', submissionData);

      expect(mockTasksService.consumeLiffToken).toHaveBeenCalledWith('task1', 'valid-token');
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('answer');
      expect(mockPrisma.submission.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task1',
          patientId: 'patient1',
          formTemplateId: 'form1',
          submittedById: 'user1',
          answers: [{ fieldId: 'f1', value: 'enc(answer)' }],
        },
      });
      expect(result.taskId).toBe('task1');
      expect(result.patientId).toBe('patient1');
      expect(result.formTemplateId).toBe('form1');
    });

    it('throws GoneException when LIFF token is invalid or already consumed', async () => {
      mockTasksService.findOne.mockResolvedValue(validTask);
      mockTasksService.consumeLiffToken.mockResolvedValue(false);

      await expect(service.create('user1', submissionData)).rejects.toThrow(GoneException);
      expect(mockPrisma.submission.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when task has no associated form template', async () => {
      const taskWithoutForm = { ...validTask, formTemplateId: null };
      mockTasksService.findOne.mockResolvedValue(taskWithoutForm);

      await expect(service.create('user1', submissionData)).rejects.toThrow(BadRequestException);
      // Token should not be consumed if the task has no form
      expect(mockTasksService.consumeLiffToken).not.toHaveBeenCalled();
      expect(mockPrisma.submission.create).not.toHaveBeenCalled();
    });

    it('validates form template before consuming the LIFF token (order of operations)', async () => {
      // If form check comes first (as coded), consuming token is skipped on bad task
      const taskWithoutForm = { ...validTask, formTemplateId: undefined };
      mockTasksService.findOne.mockResolvedValue(taskWithoutForm);

      await expect(service.create('user1', submissionData)).rejects.toThrow(BadRequestException);
      expect(mockTasksService.consumeLiffToken).not.toHaveBeenCalled();
    });

    it('uses the task patientId (not the submitter) in the submission record', async () => {
      mockTasksService.findOne.mockResolvedValue(validTask);
      mockTasksService.consumeLiffToken.mockResolvedValue(true);
      mockPrisma.submission.create.mockResolvedValue({
        id: 'sub2',
        patientId: 'patient1',
        submittedById: 'another-user',
      });

      await service.create('another-user', { ...submissionData, token: 'tok2' });

      expect(mockPrisma.submission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient1',   // from task, not from caller
            submittedById: 'another-user',
          }),
        }),
      );
    });
  });

  describe('findByTask()', () => {
    it('returns submissions ordered by submittedAt descending', async () => {
      const submissions = [
        { id: 'sub2', submittedAt: new Date('2024-02-01'), submittedBy: { displayName: 'Alice' } },
        { id: 'sub1', submittedAt: new Date('2024-01-01'), submittedBy: { displayName: 'Bob' } },
      ];
      mockPrisma.submission.findMany.mockResolvedValue(submissions);

      const result = await service.findByTask('task1');

      expect(mockPrisma.submission.findMany).toHaveBeenCalledWith({
        where: { taskId: 'task1' },
        include: { submittedBy: { select: { displayName: true } } },
        orderBy: { submittedAt: 'desc' },
      });
      expect(result).toEqual(submissions);
    });
  });
});
